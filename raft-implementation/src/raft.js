const axios = require('axios'),
    LogEntry = require('./logEntry'),
    raftStates = require('./raftStates'),
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

        this.newLogEntry = null;
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
     * Initiates the election process.
     */
    startElection() {
        this.votesReceived = 0;
        this.setState(raftStates.CANDIDATE);
        this.currentTerm++;
        this.votedFor = this.id;
        this.votesReceived++;
        console.log(`The node ${this.id} on state ${this.state} is starting the election`);
        Promise.all(this.nodes.map(nodeId => this.requestVote(nodeId)))
            .then(() => {
                console.log("All vote requests habe been sent.");
            });
    }

    /**
     * Sends vote request to specific node.
     * @param {number} nodeId - Identifier of the node to which the vote request should be send.
     */
    requestVote(nodeId) {
        console.log("the vote request is sending...");

        axios.post(`http://localhost:300${nodeId}/requestVote`, {
            candidateId: this.id,
            candidateTerm: this.currentTerm,
            candidateLastLogIndex: this.log.getLastIndex(),
            candidateLastLogTerm: this.log.getLastIndex(),
            candidateLogLength: this.log.getLogLength(),
        })
            .then(response => {
                console.log(`Vote Request sent to Node${nodeId}`);
                this.handleVoteResponse(response);
            })
            .catch(error => {
                console.error('Error sending vote Request:', error.message);
            });
    }

    /**
     * Processes the response to a request for a vote.
     * @param {object} response - Vote response of a node.
     */
    handleVoteResponse(response) {
        console.log(response.data);
        if (response.data.term > this.currentTerm) {
            this.currentTerm = response.data.term;
            this.setState(raftStates.FOLLOWER);
            return;
        }
        if (this.state === raftStates.CANDIDATE && response.data && response.data.term === this.currentTerm && response.data.voteGranted) {
            this.votesReceived++;
            console.log(`Node${this.id} received ${this.votesReceived} votes`);
            if (this.votesReceived > this.nodes.length / 2) {
                this.timeout = 1000;
                this.state = raftStates.LEADER;
                this.leaderId = this.id;
                this.resetTimerNow()
                console.log(`Node ${this.id} became the leader for term ${this.currentTerm}`);
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
        return this.state === raftStates.LEADER ? 1000 : Math.floor(Math.random() * (6000 - 3000) + 3000);
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
            try {
                await axios.post(`http://localhost:300${node}/receive-heartbeat`, {
                    term: this.currentTerm,
                    leaderId: this.id,
                    newLogEntry: this.newLogEntry,
                    lastLogIndex: this.log.getLastIndex(),
                    lastLogTerm: this.log.getLastTerm(),
                    leaderCommitIndex: this.commitIndex
                }).then((response) => {
                    console.log("Heartbeat sent from the " + this.state + " with the ID " + this.id + " to Node" + node);
                    console.log(response.data);
                    if (response.data.term > this.currentTerm) {
                        this.currentTerm = response.data.term;
                        this.setState(raftStates.FOLLOWER);
                    } else if (response.data.result) {
                        console.log('log appended successfully!');
                    }
                });
            } catch (error) {
                console.error(`Error sending heartbeat to ${node}:`, error.message);
            }
        }
    }

    /**
     * Appends a new log entry to the log if the current node is the leader.
     * @param {object} request - The POST request to add in the log.
     */
    appendLogEntry(request) {
        if (this.state === raftStates.LEADER) {
            const index = this.log.getLogLength() + 1;
            this.newLogEntry = new LogEntry(index, this.currentTerm, request);
            this.log.addEntry(this.newLogEntry);
        }
    }

    /**
     * Initiates the process of replicating logs by sending heartbeats to all nodes in the cluster.
     */
    async replicateLogs() {

        this.sendHeartbeats();

    }

    /**
     * Start the process of checking the availability of nodes in the cluster - Starting point for each node.
     */
    async init() {
        await this.fetchNodes();
        let allPortsListening = false;
        while (!allPortsListening) {
            allPortsListening = true;
            console.log("Port verification is starting...");
            for (const nodeId of this.nodes) {
                const isListening = await this.checkConnection(nodeId);
                if (!isListening) {
                    allPortsListening = false;
                    console.log(`Node ${nodeId} is not yet up.`);
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
     * Retrieve the list of nodes id available in the cluster from the cluster manager.
     */
    async fetchNodes() {
        try {
            const response = await axios.get('http://localhost:3004/cluster/nodes');
            //filter nodes id list to exclude the current node id
            this.nodes = response.data.filter(nodeId => nodeId !== this.id);
            console.log('Nodes are fetched: ', this.nodes);
        } catch (error) {
            console.error('Error fetching nodes:', error.message);
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