const axios = require('axios'),
    LogEntry = require('./logEntry'),
    raftStates = require('./raftStates'),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    Log = require('./log'),
    fs = require('fs');
    
/**
 * Raft protocol
 */
class RaftNode {
    constructor(id) {
        this.id = id;
        this.state = raftStates.FOLLOWER;

        this.currentTerm = 0;
        this.log = new Log();

        this.commitIndex = 0; 
        this.lastApplied = 0; 

        this.nextIndex = {};
        this.matchIndex = {};

        this.leaderId = null;
        this.leaderIpAddress = null;
        this.nodes = [];

        this.votedFor = null;
        this.votesReceived = 0;

        this.timer = null;
        this.timeout = null;

        this.majorityConfirmed = false;
    }

    /**
     * Set the state of the Raft node to the provided state.
     * @param {string} state - The new state of the Raft node.
     */
    setState(state) {
        this.state = state;
    }

    /**
     * Start the election process.
     */
    startElection() {
        this.votesReceived = 0;
        this.setState(raftStates.CANDIDATE);
        this.currentTerm++;
        this.votedFor = this.id;
        this.votesReceived++;
        console.log(`The node ${this.id} on state ${this.state} is starting the election`);

        let votePromises = [];

        this.nodes.forEach(node => {
            if (node.nodeId !== this.id) {
                votePromises.push(this.requestVote(node));
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

                    for (const node of this.nodes) {
                        if (node.nodeId === this.leaderId) {
                            this.leaderIpAddress = node.nodeIpAddress;
                            console.log("Leader IP Address : ", this.leaderIpAddress);
                            break;
                        }
                    }

                    this.nodes.forEach(node => {
                        const nodeId = node.nodeId
                        this.nextIndex[nodeId] = this.log.getLastIndex() + 1;
                        this.matchIndex[nodeId] = 0;
                    })
                    console.log(`Node ${this.id} became the leader for term ${this.currentTerm}`);
                    this.resetTimerNow();
                }
            })
            .catch(error => {
                console.error("An error occurred while processing vote requests:", error);
            });
    }

    /**
     * Send vote request to specific node.
     * @param {object} node - Identifier of the node to which the vote request should be send.
     */
    async requestVote(node) {
        try {
            const response = await axios.post(`http://${node.nodeIpAddress}:300${node.nodeId}/requestVote`, {
                candidateId: this.id,
                candidateTerm: this.currentTerm,
                candidateLastLogIndex: this.log.getLastIndex(),
                candidateLastLogTerm: this.log.getLastIndex(),
                candidateLogLength: this.log.getLogLength(),
            });

            console.log(`Vote Request sent to Node${node.nodeId}`);
            return response.data;
        } catch (error) {
            console.error('Error sending vote Request:', error.message);
        }
    }

    /**
     * Handle the response to a request for a vote.
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
     * Reset the timer used to manage timeouts in the Raft protocol.
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
        return this.state === raftStates.LEADER ? 10 : Math.floor(Math.random() * (5000 - 3500) + 3500);
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
            if (node.nodeId !== this.id) {
                try {
                    await axios.post(`http://${node.nodeIpAddress}:300${node.nodeId}/append-entries`, {
                        term: this.currentTerm,
                        leaderId: this.id,
                        leaderIpAddress: this.leaderIpAddress,
                        entries: null,
                        prevLogIndex: this.log.getLastIndex(),
                        prevLogTerm: this.log.getLastTerm(),
                        leaderCommitIndex: this.commitIndex
                    }).then(async (response) => {
                        console.log("Heartbeat sent from the " + this.state + " with the ID " + this.id + " to Node" + node.nodeId);
                        console.log(response.data);
                        if (response.data.term > this.currentTerm) {
                            this.currentTerm = response.data.term;
                            this.setState(raftStates.FOLLOWER);
                            return;
                        } else if (!response.data.success || response.data.term <  this.currentTerm) {
                            await this.replicateLog(node);
                        }
                    });
                } catch (error) {
                    console.error(`Error sending heartbeat to ${node.nodeId}:`, error.message);
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
        const response = await axios.get(`http://${node.nodeIpAddress}:300${node.nodeId}/getTerm`);
        const nodeTerm = response.data.term;
        if (this.nextIndex[node.nodeId] === undefined || nodeTerm < this.currentTerm) {
            const response = await axios.get(`http://${node.nodeIpAddress}:300${node.nodeId}/lastlogindex`);
            this.nextIndex[node.nodeId] = response.data.lastIndex + 1;
        }

        while (lastLogIndex >= this.nextIndex[node.nodeId]) {
            let nextIndex = this.nextIndex[node.nodeId];

            try {
                const prevEntry = this.log.getEntry(nextIndex - 1);
                console.log("Previous Entry Index: " + prevEntry.index);
                const prevLogIndex = prevEntry.index;
                const prevLogTerm = prevEntry.term;

                const response = await axios.post(`http://${node.nodeIpAddress}:300${node.nodeId}/append-entries`, {
                    term: this.currentTerm,
                    leaderId: this.id,
                    prevLogIndex: prevLogIndex,
                    prevLogTerm: prevLogTerm,
                    entries: this.log.getEntriesFrom(nextIndex),
                    leaderCommitIndex: this.commitIndex
                });

                if (response.data.term > this.currentTerm) {
                    this.currentTerm = response.data.term;
                    this.setState(raftStates.FOLLOWER);
                    return;
                }

                if (response.data.success) {
                    this.matchIndex[node.nodeId] = lastLogIndex;
                    this.nextIndex[node.nodeId] = this.matchIndex[node.nodeId] + 1;
                } else {
                    this.nextIndex[node.nodeId] -= 1;
                }
            } catch (error) {
                console.error(`Append Entries failed for Node${node.nodeId} : ${error.message}`);
                break;
            }
        }
    }

    /**
     * Appends a new log entry to the log if the current node is the leader.
     * @param {object} request - The POST request to add in the log.
     */
    receiveNewEntry(request) {
        if (this.state === raftStates.LEADER) {
            this.log.addEntry(new LogEntry(this.log.getLastIndex() + 1, this.currentTerm, request));
            //this.persistLog();
            this.resetTimerNow();
        }
    }

    /**
     * Initiates the process of replicating logs by sending heartbeats to all nodes in the cluster.
     */
    async replicateLogs() {
        this.matchIndex[this.id] = this.log.getLastIndex();
        console.log(this.nodes)
        for (const node of this.nodes) {
            if (node.nodeId !== this.id) {
                this.replicateLog(node);
            }
        }

        while (true) {
            let N = this.commitIndex + 1;
            let matchCount = 0;

            Object.values(this.matchIndex).forEach(matchIndex => {
                if (matchIndex >= N) {
                    matchCount++;
                }
            });

            if (matchCount > Math.floor(this.nodes.length / 2) && this.log.getEntry(N) && this.log.getEntry(N).term === this.currentTerm) {
                this.commitIndex++;
                this.majorityConfirmed = true;
                this.lastApplied++;
                console.log(this.log.getLog());
                this.nextIndex[this.id] = this.matchIndex[this.id] + 1;
            } else {
                break;
            }

            this.sendHeartbeats();
        }
    }

    /**
     * Store the log in a json file
     */
    persistLog() {
        fs.writeFileSync(`log_node_${this.id}.json`, JSON.stringify(this.log));
    }

    /**
     * Load the log store in the json file
     */
    loadLog() {
        try {
            this.log.loadLog(JSON.parse(fs.readFileSync(`log_node_${this.id}.json`)).log);
            console.log(this.log);
        } catch (err) {
            console.error(`Error loading log for node ${this.id}`, err.message);
            this.log = new Log();
        }
    }

    /**
     * Start the process of checking the availability of nodes in the cluster - Starting point for each node.
     */
    async init() {
        while (this.nodes.length < 3) {
            console.log("Waiting for at least 3 nodes...");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        let allPortsListening = false;
        while (!allPortsListening) {
            allPortsListening = true;
            console.log("Port verification is starting...");
            for (const node of this.nodes) {
                if (node.nodeId !== this.id) {
                    const isListening = await this.checkConnection(node);
                    if (!isListening) {
                        allPortsListening = false;
                        console.log(`Node ${node.nodeId} is not yet up.`);
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
     * @param {object} node -  Node to be check.
     * @returns True if the node is available, otherwise False.
     */
    async checkConnection(node) {
        try {
            const response = await axios.get(`http://${node.nodeIpAddress}:300${node.nodeId}/isAvailable`);
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