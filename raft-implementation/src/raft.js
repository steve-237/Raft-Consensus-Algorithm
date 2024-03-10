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
        this.votedFor = null;
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

        this.newLogEntry = null;
        this.votesReceived = 0;
        this.voteRequestReceived = false;
        this.electionTimer = null;
        this.heartbeatTimer = null;
    }

    startElectionTimeout() {
        clearTimeout(this.electionTimer);
        this.electionTimeout = Math.floor(Math.random() * (3000 - 1500) + 1500);
        this.electionTimer = setTimeout(async () => {
            console.log(`Start election timeout function...`);
            this.stopHeartbeatTimer();
            console.log(this.voteRequestReceived);
            if (!this.voteRequestReceived) {
                console.log(this.leaderIsAvailable);
                if (this.leaderIsAvailable === false) {
                    this.startElection();
                }
            } else {
                return;
            }
        }, this.electionTimeout);
    }

    setState(state) {
        this.state = state;
    }

    startElection() {
        console.log(`Election timeout : ${this.electionTimeout} ms.`);
        console.log(`Election timer : ${this.electionTimer} ms.`);
        if (this.state !== raftStates.FOLLOWER) return;
        this.setState(raftStates.CANDIDATE);
        this.currentTerm++;
        this.votedFor = this.id;
        this.votesReceived = 1;
        console.log(`The node ${this.id} on state ${this.state} is starting the election`);
        Promise.all(this.nodes.map(nodeId => this.requestVote(nodeId)))
            .then(() => {
                console.log("All vote requests sent.");
            });
    }

    /**
     * 
     */
    stopElectionTimer() {
        clearTimeout(this.electionTimer);
    }

    /**
     * 
     */
    stopHeartbeatTimer() {
        console.log("heartbeat Timer resets");
        clearInterval(this.heartbeatTimer);
    }

    /**
     * 
     */
    heartbeatInterval() {
        this.heartbeatTimer = setInterval(() => {
            console.log(`heartbeat Timeout achieved for node${this.id}`);
            this.voteRequestReceived = false;
            this.votedFor = null;
            this.state = raftStates.FOLLOWER;
            this.leaderId = null;
            this.startElectionTimeout();
        }, 10000);
    }

    /**
     * Send vote request to specific node.
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
     * 
     * @param {*} response 
     */
    handleVoteResponse(response) {
        console.log(response.data);
        if (this.state === raftStates.CANDIDATE && response.data && response.data.term === this.currentTerm && response.data.voteGranted) {
            this.votesReceived++;
            console.log(`Node${this.id} received ${this.votesReceived} votes`);
            if (this.votesReceived > this.nodes.length / 2) {
                this.becomeLeader();
            }
        } else if (this.leaderId === null) {
            setTimeout(() => {
                this.voteRequestReceived = false;
                this.votedFor = null;
                this.state = raftStates.FOLLOWER;
                this.leaderId = null;
                this.startElectionTimeout();
            }, 1000);
        }
    }

    /**
     * 
     */
    async becomeLeader() {
        this.state = raftStates.LEADER;
        this.leaderId = this.id;
        this.stopElectionTimer();
        console.log(`Node ${this.id} became the leader for term ${this.currentTerm}`);
        await this.sendHeartbeats();
    }

    /**
     * 
     */
    async sendHeartbeats() {
        while (this.state === raftStates.LEADER) {

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
                        if (response.data.success === true) {
                            console.log("New log appended successfuly");
                        }
                    });
                } catch (error) {
                    console.error(`Error sending heartbeat to ${node}:`, error.message);
                }
            }
            this.newLogEntry = null;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    /**
     * 
     * @param {*} request 
     */
    appendLogEntry(request) {
        if (this.state === raftStates.LEADER) {
            const index = this.log.getLogLength() + 1;
            this.newLogEntry = new LogEntry(index, this.currentTerm, request);
            this.log.addEntry(this.newLogEntry);
        }
    }

    async replicateLogs() {

        this.sendHeartbeats();

    }

    /**
     * Initiate the process of checking the availability of nodes in the cluster.
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
        this.runRaft();
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
            this.startElectionTimeout();
        }
        this.startElectionTimeout();
    }
}

module.exports = RaftNode;