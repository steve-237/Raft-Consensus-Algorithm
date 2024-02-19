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
        this.log = [];;
        this.votesReceived = 0;
        this.voteResquestReceived = false;
        this.electionTimer = null;
    }

    startElectionTimeout() {
        clearTimeout(this.electionTimer);
        this.electionTimeout = Math.floor(Math.random() * (300 - 150) + 150);
        this.electionTimer = setTimeout(async () => {
            console.log(`Start election timeout function...`);
            if (!this.voteResquestReceived) {
                this.checkForLeader();
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

    resetElectionTimeout() {
        this.startElectionTimeout();
    }

    stopElectionTimeout() {
        clearTimeout(this.electionTimer);
    }

    requestVote(nodeId) {
        console.log("the vote request is sending...");
        axios.post(`http://localhost:300${nodeId}/requestVote`, {
            candidateId: this.id,
            term: this.currentTerm
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

    resetVoteTimeout() {
        this.voteResquestReceived = false;
        this.startElectionTimeout();
    }

    async becomeLeader() {
        this.state = 'leader';
        clearTimeout(this.electionTimeout);
        console.log(`Node ${this.id} became the leader for term ${this.currentTerm}`);
        try {
            await axios.post(`http://localhost:3004/send-leader-id`, {
                leaderId: this.id
            }).then((response) => {
                console.log("Leader register to the cluster Manager");
                console.log(response.data);
            });
        } catch (error) {
            console.error(`Node leader registration faild:`, error.message);
        }
        await this.sendHeartbeats();
    }

    async sendHeartbeats() {
        while (this.state === 'leader') {
            for (const node of this.nodes) {
                try {
                    await axios.post(`http://localhost:300${node}/receive-heartbeat`, {
                        term: this.currentTerm,
                        leaderId: this.id
                    }).then((response) => {
                        console.log("Heartbeat sent from the " + this.state + " with the ID " + this.id + " to Node" + node);
                        console.log(response.data);
                    });
                } catch (error) {
                    console.error(`Error sending heartbeat to ${node}:`, error.message);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async checkForLeader() {
        try {
            const response = await axios.get('http://localhost:3004/leaderId');
            this.leaderIsAvailable = response.data;
            console.log('There is already a leader');
        } catch (error) {
            console.log('There is no leader yet');
            console.error('Error checking for leader:', error.message);
        }
    }

    appendLogEntry(request) {
        if (this.state === 'leader') {
            const index = this.log.length + 1;
            const newLogEntry = new LogEntry(index, this.currentTerm, request);
            this.log.push(newLogEntry);
            console.log(this.log);
        }
    }

    replicateLog(logEntry) {
        for (const nodeId of this.nodes) {
            axios.post(`http://localhost:300${nodeId}/replicate-log`, logEntry)
                .then(response => {
                    console.log(`Log entry replicated to Node ${nodeId}:`, response.data);
                })
                .catch(error => {
                    console.error(`Error replicating log entry to Node ${nodeId}:`, error.message);
                });
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
            const response = await axios.get(`http://localhost:300${port}`);
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