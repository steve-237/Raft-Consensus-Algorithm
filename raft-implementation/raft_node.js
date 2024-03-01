const RaftNode = require('./raft'),
    express = require('express'),
    app = express(),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    axios = require('axios'),
    NODE_ID = parseInt(process.argv[2]),
    raftNode = new RaftNode(NODE_ID);

const multer = require('multer')
//const formData = multer();

//app.use(formData.none());

app.use(express.json());

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

//handle a vote request send by a candidate
app.post('/requestVote', (req, res) => {
    const { candidateId, candidateTerm, candidateLastLogIndex, candidateLastLogTerm, candidateLogLength } = req.body;

    raftNode.voteRequestReceived = true;

    console.log(`Vote request received from ${candidateId} at term ${raftNode.currentTerm} of Node${raftNode.id}`);

    const lastLog = raftNode.log[raftNode.log.length - 1];
    const lastTerm = lastLog ? lastLog.term : 0;

    const logOk = candidateLastLogTerm > lastTerm || (candidateLastLogTerm === lastTerm && candidateLogLength >= raftNode.log.length);

    if (candidateTerm < raftNode.currentTerm || !logOk || raftNode.votedFor !== null && raftNode.votedFor !== candidateId) {
        res.json({ nodeId: raftNode.id, voteGranted: false, term: raftNode.currentTerm });
    } else {
        raftNode.currentTerm = candidateTerm;
        raftNode.votedFor = candidateId;
        raftNode.state = raftNode.votedFor !== raftNode.id ? 'follower' : raftNode.state;
        res.json({ nodeId: raftNode.id, voteGranted: true, term: raftNode.currentTerm });
    }
});

app.post('/receive-heartbeat', (req, res) => {
    const { term, leaderId, newLogEntry } = req.body;
    raftNode.leaderId = leaderId;

    raftNode.stopHeartbeatTimer();
    try {
        console.log("Heartbeat received from Node" + leaderId + " at term " + term);
        console.log(`[Node${raftNode.id}] currentTerm = ${raftNode.currentTerm}`);

        if (newLogEntry !== null) {
            raftNode.log.push(newLogEntry);
            console.log(raftNode.log);
        }

        if (term !== raftNode.currentTerm) {
            raftNode.currentTerm = term;
            console.log(`Current Term of Node${raftNode.id} updated to ${term}`);
        }
        raftNode.heartbeatInterval();
        res.status(200).send('Heartbeat from leader received');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.all('*', async function (req, res, next) {

    const userAgent = req.headers['user-agent'];

    console.log(userAgent);
    if (!userAgent.includes(axios)) {
        console.log('Request', req.protocol, req.method, req.url);
        let request = req;
        if (req.method === 'POST') {

            if (raftNode.state !== 'leader') {
                const redirectUrl = `http://localhost:300${raftNode.leaderId}${req.originalUrl}`;
                console.log(`Redirection of the request to the leader: ${redirectUrl}`);
                proxy.web(req, res, { target: `${req.protocol}://${req.hostname}:300${raftNode.leaderId}` });
            } else {
                let body = '';

                req.on('data', chunk => {
                    console.log("Chunk start:" + chunk + ": Chunk end.");
                    body += chunk.toString();
                });
                req.on('end', async () => {
                    request = {
                        method: req.method,
                        url: req.originalUrl,
                        body: body,
                        params: req.params,
                        query: req.query,
                        headers: req.headers,
                        timestamp: new Date().toISOString()
                    };
                    console.log('Data to be processed with Raft:', request);

                    try {
                        raftNode.appendLogEntry(request);
                    } catch (error) {
                        console.error('Error appending the Log Entry:', error.message);
                        res.status(500).send('Error appending the Log Entry');
                    }
                });
            }
        }
        proxy.web(request, res, { target: `${req.protocol}://${req.hostname}` });
    } else {
        next();
    }
});

app.listen(3000 + NODE_ID, () => {
    console.log(`Node running on port ${3000 + NODE_ID}`);
    raftNode.checkAllPortsOnAllNodes();
});