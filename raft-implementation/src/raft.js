const axios = require('axios'),
    LogEntry = require('./logEntry'),
    raftStates = require('./raftStates'),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    Log = require('./log');

class RaftNode {
    constructor(id) {
        this.id = id;
        this.state = raftStates.FOLLOWER;

        //peristent on all servers
        this.currentTerm = 0;
        this.log = new Log();

        //volatile on all servers
        this.commitIndex = 0; //index of highest log entry known to be commited
        this.lastApplied = 0; //index of highest log entry applied to state machine

        //volatile on leaders
        this.nextIndex = []; //for each server, index of the next log entry to send to that server (initialized to leader last log index + 1)
        this.matchIndex = []; //for each server, index of highest log entry known to be replicated on server (initialized to 0, increases monotonically)

        this.leaderId = null;
        this.leaderIsAvailable = false;
        this.nodes = [];

        this.votedFor = null;
        this.votesReceived = 0;

        this.timer = null;
        this.timeout = null;
    }

    /**
     * Sets the state of the Raft node to the provided state.
     * @param {string} state - The new state of the Raft node.
     */
    setState(state) {
        this.state = state;
    }

    /**
     * Starts the election process.
     */
    startElection() {
        this.votesReceived = 0;
        this.setState(raftStates.CANDIDATE);
        this.currentTerm++;
        this.votedFor = this.id;
        this.votesReceived++;
        console.log(`The node ${this.id} on state ${this.state} is starting the election`);

        let votePromises = [];

        this.nodes.forEach(nodeId => {
            if (nodeId !== this.id) {
                votePromises.push(this.requestVote(nodeId));
            }
        });

        votePromises.reduce((promiseChain, currentPromise) => {
            return promiseChain.then(() => {
                return currentPromise.then(response => {
                    this.handleVoteResponse(response);
                }).catch(error => {
                    console.error("An error occurred while sending vote request:", error);
                });
            });
        }, Promise.resolve())
            .then(() => {
                console.log("All vote requests have been sent and processed.");
                console.log(`Node${this.id} received ${this.votesReceived} votes`);

                // becomes leader if the majority of nodes vote for this node
                if (this.votesReceived > this.nodes.length / 2) {
                    this.setState(raftStates.LEADER);
                    this.leaderId = this.id;
                    this.nextIndex = Array(this.nodes.length).fill(this.log.getLastIndex() + 1);
                    this.matchIndex = Array(this.nodes.length).fill(0);
                    console.log("Contenu de this.nextIndex :", this.nextIndex);
                    console.log("Contenu de this.matchIndex :", this.matchIndex);
                    console.log(`Node ${this.id} became the leader for term ${this.currentTerm}`);
                    this.resetTimerNow();
                }
            })
            .catch(error => {
                console.error("An error occurred while processing vote requests:", error);
            });
    }

    /**
     * Sends vote request to specific node.
     * @param {number} nodeId - Identifier of the node to which the vote request should be send.
     */
    async requestVote(nodeId) {
        try {
            const response = await axios.post(`http://localhost:300${nodeId}/requestVote`, {
                candidateId: this.id,
                candidateTerm: this.currentTerm,
                candidateLastLogIndex: this.log.getLastIndex(),
                candidateLastLogTerm: this.log.getLastIndex(),
                candidateLogLength: this.log.getLogLength(),
            });

            console.log(`Vote Request sent to Node${nodeId}`);
            return response.data;
        } catch (error) {
            console.error('Error sending vote Request:', error.message);
            //throw error;
        }
    }

    /**
     * Processes the response to a request for a vote.
     * @param {object} response - Vote response of a node.
     */
    handleVoteResponse(response) {
        console.log(response);
        if (response) {
            if (response.term > this.currentTerm) {
                this.currentTerm = response.term;
                this.setState(raftStates.FOLLOWER);
                return;
            }
            if (this.state === raftStates.CANDIDATE && response.term === this.currentTerm && response.voteGranted) {
                this.votesReceived++;
            }
        }
    }

    /**
     * Resets the timer used to manage timeouts in the Raft protocol.
     */
    resetTimer() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
        }
        this.timeout = this.getTimeout();
        console.log(this.timeout);
        this.timer = setTimeout(() => {
            console.log(this.state);
            this.runRaft()
        }, this.timeout);
    }

    /**
     * Immediately resets the timer used to manage waiting times
     */
    resetTimerNow() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
        }
        this.timeout = this.getTimeout();
        console.log(this.timeout);
        this.timer = setTimeout(() => {
            console.log(this.state);
            this.runRaft()
        }, 0);
    }

    /**
     * Assigns the timeout value based on the current state of the Raft node.
     * @returns - The timeout to keep the leader alive if the Node is a leader or the timeout to start a new election if the Node is a follower
     */
    getTimeout() {
        return this.state === raftStates.LEADER ? 5000 : Math.floor(Math.random() * (12000 - 6000) + 6000);
    }

    /**
     * Stops the timer if the Raft node's state is FOLLOWER.
     */
    stopTimer() {
        console.log('timer has been stopped');
        if (this.state === raftStates.FOLLOWER) clearTimeout(this.timer);
    }

    /**
     * Sends heartbeat to all nodes in the cluster.
     */
    async sendHeartbeats() {
        for (const node of this.nodes) {
            if (node !== this.id) {
                try {
                    await axios.post(`http://localhost:300${node}/append-entries`, {
                        term: this.currentTerm,
                        leaderId: this.id,
                        entries: null,
                        prevLogIndex: this.log.getLastIndex(),
                        prevLogTerm: this.log.getLastTerm(),
                        leaderCommitIndex: this.commitIndex
                    }).then(async (response) => {
                        console.log("Heartbeat sent from the " + this.state + " with the ID " + this.id + " to Node" + node);
                        console.log(response.data);
                        if (response.data.term > this.currentTerm) {
                            this.currentTerm = response.data.term;
                            this.setState(raftStates.FOLLOWER);
                            return;
                        } else if (!response.data.success) {
                            await this.replicateLog(node);
                        }
                    });
                } catch (error) {
                    console.error(`Error sending heartbeat to ${node}:`, error.message);
                }
            }
        }
    }

    /**
     * replicate log on a specific Node.
     * @param {number} node - Node Id
     * @returns 
     */
    async replicateLog(node) {
        const lastLogIndex = this.log.getLastIndex();
        console.log("Last log Index : " + lastLogIndex);
        console.log("Next Index : " + this.nextIndex[node - 1]);

        try {
            while (lastLogIndex >= this.nextIndex[node - 1]) {
                const next = this.nextIndex[node - 1];
                let result;

                try {
                    const prevEntry = this.log.getEntry(next - 1);
                    console.log("Previous Entry Index: " + prevEntry.index);
                    const prevLogIndex = prevEntry.index;
                    const prevLogTerm = prevEntry.term;

                    const response = await axios.post(`http://localhost:300${node}/append-entries`, {
                        term: this.currentTerm,
                        leaderId: this.id,
                        prevLogIndex: prevLogIndex,
                        prevLogTerm: prevLogTerm,
                        entries: this.log.getEntriesFrom(next),
                        leaderCommitIndex: this.commitIndex
                    });

                    result = response.data;

                    if (result.term > this.currentTerm) {
                        this.currentTerm = result.term;
                        this.setState(raftStates.FOLLOWER);
                        return;
                    }

                    if (result.success) {
                        this.matchIndex[node - 1] = lastLogIndex;
                        this.nextIndex[node - 1] = this.matchIndex[node - 1] + 1;
                    } else {
                        this.nextIndex[node - 1]--;
                        if (this.nextIndex[node - 1] < this.log.getFirstIndex()) {
                            console.log('Decrement nextIndex and retry');
                        }
                    }
                } catch (error) {
                    console.error(`Append Entries failed for Node${node} : ${error.message}`);
                    break;
                }

                break;
            }
        } catch (error) {
            console.error(`Error occurred during replication for Node${node}: ${error.message}`);
        }
    }

    /**
     * Appends a new log entry to the log if the current node is the leader.
     * @param {object} request - The POST request to add in the log.
     */
    receiveNewEntry(request) {
        if (this.state === raftStates.LEADER) {
            this.log.addEntry(new LogEntry(this.log.getLastIndex() + 1, this.currentTerm, request));
            this.resetTimerNow();
        }
    }

    /**
     * Initiates the process of replicating logs by sending heartbeats to all nodes in the cluster.
     */
    async replicateLogs() {
        this.matchIndex[this.id - 1] = this.log.getLastIndex();
        console.log(this.nodes)
        for (const node of this.nodes) {
            if (node !== this.id) {
                this.replicateLog(node);
            }
        }

        let N = -1;
        for (let i = this.commitIndex + 1; i < this.log.getLogLength(); i++) {
            let count = 0;
            if (this.log.getEntry(i).term === this.currentTerm) {
                for (let j = 0; j < this.matchIndex.length; j++) {
                    if (this.matchIndex[j] >= i) {
                        count++;
                    }
                }
                if (count > this.matchIndex.length / 2) {
                    N = i;
                }
            }
        }

        // If such N is found, update commitIndex
        if (N !== -1) {
            this.commitIndex = N;
            this.lastApplied++;
            console.log(this.log.getLog());

            //proxy.web(this.log.getLastEntry().request, res, { target: `http://localhost` });
            this.nextIndex[this.id - 1] = this.matchIndex[this.id - 1] + 1;
            console.log("Match index : ", this.matchIndex);
            console.log("Next index : ", this.nextIndex);
        }

        this.sendHeartbeats();
    }

    /**
     * Start the process of checking the availability of nodes in the cluster - Starting point for each node.
     */
    async init() {
        //await this.fetchNodes();
        while (this.nodes.length < 3) {
            console.log("Waiting for at least nodes...");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        let allPortsListening = false;
        while (!allPortsListening) {
            allPortsListening = true;
            console.log("Port verification is starting...");
            for (const nodeId of this.nodes) {
                if (nodeId !== this.id) {
                    const isListening = await this.checkConnection(nodeId);
                    if (!isListening) {
                        allPortsListening = false;
                        console.log(`Node ${nodeId} is not yet up.`);
                    }
                }
            }
            if (!allPortsListening) {
                console.log("Retry to check if nodes are up...")
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        console.log('All nodes are running!');
        this.resetTimer();
    }

    /**
     * Check if the current node can communicate with a specific node.
     * @param {number} nodeId -  Identifier of the node to check.
     * @returns True if the node is available, otherwise False.
     */
    async checkConnection(nodeId) {
        try {
            const response = await axios.get(`http://localhost:300${nodeId}/isAvailable`);
            console.log(response.data);
            return response.data;
        } catch (error) {
            return false;
        }
    }

    /**
     * Start the execution of the raft protocole
     */
    runRaft() {
        if (this.state === raftStates.LEADER) {
            console.log("Commit index : " + this.commitIndex)
            console.log("Last index : " + this.log.getLastIndex())
            if (this.commitIndex < this.log.getLastIndex()) {
                this.replicateLogs();
            } else {
                this.sendHeartbeats();
            }
        } else {
            this.startElection();
        }
        this.resetTimer();
    }
}

module.exports = RaftNode;