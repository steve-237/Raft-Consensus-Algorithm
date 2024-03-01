const axios = require('axios');
const LogEntry = require('./logEntry');

class RaftNode {
    constructor(id) {
        this.id = id;
        this.state = 'follower';
        this.currentTerm = 0;
        this.votedFor = null;
        this.leaderId = null;
        this.leaderIsAvailable = false;
        this.nodes = [];
        this.log = [];
        this.commitIndex = 0; //index of highest log entry known to be commited
        this.lastApplied = 0; //index of highest log entry applied to state machine
        this.lastLogIndex = 0;
        this.lastLogTerm = 0;
        this.newLogEntry = null;
        this.votesReceived = 0;
        this.voteRequestReceived = false;
        this.electionTimer = null;
        this.heartbeatTimer = null;
        this.nextIndex = [] //for each server, index of the next log entry to send to that server (initialized to leader last log index + 1)
    }

    startElectionTimeout() {
        clearTimeout(this.electionTimer);
        this.electionTimeout = Math.floor(Math.random() * (300 - 150) + 150);
        this.electionTimer = setTimeout(async () => {
            console.log(`Start election timeout function...`);
            this.stopHeartbeatTimer();
            if (!this.voteRequestReceived) {
                //this.checkForLeader();
                console.log(this.leaderIsAvailable);
                if (this.leaderIsAvailable === false) {
                    this.startElection();
                }
            }
        }, this.electionTimeout);
    }

    startElection() {
        console.log(`Election timeout : ${this.electionTimeout} ms.`);
        console.log(`Election timer : ${this.electionTimer} ms.`);
        if (this.state !== 'follower') return;
        this.state = 'candidate';
        this.currentTerm++;
        this.votedFor = this.id;
        this.votesReceived = 1;
        console.log(`The node ${this.id} on state ${this.state} is starting the election`);
        Promise.all(this.nodes.map(nodeId => this.requestVote(nodeId)))
            .then(() => {
                console.log("All vote requests sent.");
            });
    }

    stopElectionTimer() {
        clearTimeout(this.electionTimer);
    }

    stopHeartbeatTimer() {
        console.log("heartbeat Timer resets");
        clearInterval(this.heartbeatTimer);
    }

    heartbeatInterval() {
        this.heartbeatTimer = setInterval(() => {
            console.log(`heartbeat Timeout achieved for node${this.id}`);
            this.voteRequestReceived = false;
            this.votedFor = null;
            this.startElectionTimeout();
        }, 1500);
    }

    requestVote(nodeId) {
        console.log("the vote request is sending...");

        if (this.log.length > 0) {
            this.lastLogIndex = this.log[this.log.length - 1].index;
            this.lastLogTerm = this.log[this.log.length - 1].term;
        }
        axios.post(`http://localhost:300${nodeId}/requestVote`, {
            candidateId: this.id,
            candidateTerm: this.currentTerm,
            candidateLastLogIndex: this.lastLogIndex,
            candidateLastLogTerm: this.lastLogTerm,
            candidateLogLength: this.log.length,
        })
            .then(response => {
                console.log(`Vote Request sent to Node${nodeId}`);
                this.handleVoteResponse(response);
            })
            .catch(error => {
                console.error('Error sending vote Request:', error.message);
            });
    }

    handleVoteResponse(response) {
        console.log(response.data);
        if (response.data && response.data.term === this.currentTerm && response.data.voteGranted) {
            this.votesReceived++;
            console.log(`Node${this.id} received ${this.votesReceived} votes`);
            if (this.votesReceived > this.nodes.length / 2) {
                this.becomeLeader();
            }
        }
    }

    async becomeLeader() {
        this.state = 'leader';
        this.stopElectionTimer();
        console.log(`Node ${this.id} became the leader for term ${this.currentTerm}`);
        /* try {
            await axios.post(`http://localhost:3004/send-leader-id`, {
                leaderId: this.id
            }).then((response) => {
                console.log("Leader register to the cluster Manager");
                console.log(response.data);
            });
        } catch (error) {
            console.error(`Node leader registration faild:`, error.message);
        } */
        await this.sendHeartbeats();
    }

    async sendHeartbeats() {
        while (this.state === 'leader') {
            for (const node of this.nodes) {
                try {
                    await axios.post(`http://localhost:300${node}/receive-heartbeat`, {
                        term: this.currentTerm,
                        leaderId: this.id,
                        newLogEntry: this.newLogEntry
                    }).then((response) => {
                        console.log("Heartbeat sent from the " + this.state + " with the ID " + this.id + " to Node" + node);
                        console.log(response.data);
                    });
                } catch (error) {
                    console.error(`Error sending heartbeat to ${node}:`, error.message);
                }
            }
            this.newLogEntry = null;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    appendLogEntry(request) {
        if (this.state === 'leader') {
            const index = this.log.length + 1;
            this.newLogEntry = new LogEntry(index, this.currentTerm, request);
            this.log.push(this.newLogEntry);
            console.log(this.log);
        }
    }

    async checkAllPortsOnAllNodes() {
        await this.startNode();
        let allPortsListening = false;
        while (!allPortsListening) {
            allPortsListening = true;
            console.log("Port verification is starting...");
            for (const port of this.nodes) {
                const isListening = await this.checkPortListening(port);
                if (!isListening) {
                    allPortsListening = false;
                    console.log(`Node ${port} is not yet up.`);
                }
            }
            if (!allPortsListening) {
                console.log("Retry to check if nodes are up...")
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        console.log('All nodes are running!');
        this.startElectionTimeout();
    }

    async checkPortListening(port) {
        try {
            const response = await axios.get(`http://localhost:300${port}/isAvailable`);
            console.log(response.data);
            return response.data;
        } catch (error) {
            return false;
        }
    }

    async startNode() {
        try {
            const response = await axios.get('http://localhost:3004/cluster/nodes');
            this.nodes = response.data.filter(nodeId => nodeId !== this.id);
            console.log('Nodes are fetched: ', this.nodes);
        } catch (error) {
            console.error('Error fetching nodes:', error.message);
        }
    }
}

module.exports = RaftNode;