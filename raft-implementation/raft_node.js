const RaftNode = require('./raft'),
    express = require('express'),
    app = express(),
    NODE_ID = parseInt(process.argv[2]),
    raftNode = new RaftNode(NODE_ID);

app.use(express.json());

app.get("/", (req, res) => {
    return res.status(200).send("true");
})

app.get('/isAvailable', (req, res) => {
    res.status(200).send('Yes');
});

app.post('/start-election', (req, res) => {
    raftNode.voteResquestReceived = false;
    raftNode.votedFor = null;
    raftNode.state = 'follower';
    raftNode.startElectionTimeout();
    console.log(`Received request to start a new leader election.`);
    res.status(200).send(`Node ${raftNode.id} started a new leader election.`);
});

app.post('/requestVote', (req, res) => {
    const { candidateId, term } = req.body;

    raftNode.voteResquestReceived = true;

    console.log(`Vote request received from ${candidateId} at term ${raftNode.currentTerm} of Node${raftNode.id}`);

    if (term < raftNode.currentTerm) {
        res.json({ nodeId: raftNode.id, voteGranted: false, term: raftNode.currentTerm });
    } else {
        if (raftNode.votedFor === null || raftNode.votedFor === candidateId) {
            raftNode.currentTerm = term;
            raftNode.votedFor = candidateId;
            if (raftNode.votedFor !== raftNode.id) {
                raftNode.state = 'follower';
            }
            res.json({ nodeId: raftNode.id, voteGranted: true, term: raftNode.currentTerm });
        } else {
            res.json({ nodeId: raftNode.id, voteGranted: false, term: raftNode.currentTerm });
        }
    }
});

app.post('/receive-heartbeat', (req, res) => {
    const { term, leaderId, newLogEntry } = req.body;
    try {
        console.log("Heartbeat received from Node" + leaderId + " at term " + term);
        console.log(`[Node${raftNode.id}] currentTerm = ${raftNode.currentTerm}`);

        if(newLogEntry !== null){
            raftNode.log.push(newLogEntry);
            console.log(raftNode.log);
        }

        if (term !== raftNode.currentTerm) {
            raftNode.currentTerm = term;
            console.log(`Current Term of Node${raftNode.id} updated to ${term}`);
        }

        res.status(200).send('Heartbeat from leader received');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

//append a new log after receiving a request from a client
app.post('/append-log', (req, res) => {
    const data = req.body;
    raftNode.appendLogEntry(data);
    res.status(200).send('success');
});

app.listen(3000 + NODE_ID, () => {
    console.log(`Node running on port ${3000 + NODE_ID}`);
    raftNode.checkAllPortsOnAllNodes();
});