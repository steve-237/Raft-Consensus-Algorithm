const RaftNode = require('./raft'),
    express = require('express'),
    app = express(),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    raftStates = require('./raftStates'),
    axios = require('axios'),
    NODE_ID = parseInt(process.argv[2]),
    raftNode = new RaftNode(NODE_ID);

app.use(express.json({ limit: '10mb' })); //increase the size of the parsed payload in the body of a request

app.get('/isAvailable', (req, res) => {
    res.status(200).send(true);
});

/**
 * Handle a vote request send by a candidate.
 */
app.post('/requestVote', (req, res) => {
    const { candidateId, candidateTerm, candidateLastLogIndex, candidateLastLogTerm, candidateLogLength } = req.body;
    console.log(`received from candidate ${candidateId}, ${candidateTerm}, ${candidateLastLogIndex}, ${candidateLastLogTerm}, ${candidateLogLength}`)

    raftNode.voteRequestReceived = true;

    console.log(`Vote request received from ${candidateId} at term ${raftNode.currentTerm} of Node${raftNode.id}`);

    const lastLog = raftNode.log.getLastEntry();
    const lastTerm = lastLog ? lastLog.term : 0;

    const logOk = candidateLastLogTerm > lastTerm || (candidateLastLogTerm === lastTerm && candidateLogLength >= raftNode.log.getLogLength());

    if (candidateTerm < raftNode.currentTerm || !logOk || raftNode.votedFor !== null && raftNode.votedFor !== candidateId) {
        res.json({ nodeId: raftNode.id, voteGranted: false, term: raftNode.currentTerm });
    } else {
        raftNode.currentTerm = candidateTerm;
        raftNode.votedFor = candidateId;
        raftNode.setState(raftStates.FOLLOWER);
        res.json({ nodeId: raftNode.id, voteGranted: true, term: raftNode.currentTerm });
    }
});

app.post('/receive-heartbeat', (req, res) => {
    const { term, leaderId, newLogEntry, lastLogIndex, lastLogTerm, leaderCommitIndex } = req.body;
    raftNode.stopHeartbeatTimer();
    raftNode.leaderId = leaderId;
    raftNode.voteRequestReceived = true;

    console.log("Heartbeat received from Node" + leaderId + " at term " + term);
    console.log(`[Node${raftNode.id}] currentTerm = ${raftNode.currentTerm}`);

    if (term > raftNode.currentTerm) {
        raftNode.currentTerm = term;
        raftNode.votedFor = null;
        raftNode.setState(raftStates.FOLLOWER);
    }


    if (newLogEntry !== null) {
        /* if (lastLogIndex < raftNode.log.getLogLength() && raftNode.log.getLastEntry().term === lastLogTerm) {
            if (raftNode.log.getLastEntry().term !== newLogEntry.term) {
                raftNode.log.splice(lastLogIndex);
            }
        }

        if (leaderCommitIndex > raftNode.commitIndex) {
            const lastIndex = Math.min(leaderCommitIndex, raftNode.log.length - 1);
            raftNode.commitIndex = lastIndex;
        }

        console.log(`Leader Term = ${term} - Follower Term = ${raftNode.currentTerm}`);
        console.log(`lastLogIndex= ${lastLogIndex} - raftNode.log.length = ${raftNode.log.length}`);
        if (lastLogIndex - 1 >= 0 && lastLogIndex - 1 < raftNode.log.length) {
            const lastLogEntry = raftNode.log[lastLogIndex - 1];
            console.log(`raftNode.log[lastLogIndex].term= ${lastLogEntry.term} - lastLogTerm = ${lastLogTerm}`);
            if (term < raftNode.currentTerm || lastLogEntry.term !== lastLogTerm) {
                res.status(200).send({ Node: raftNode.id, term: raftNode.currentTerm, success: false });
                return;
            }
        } */
        raftNode.log.addEntry(newLogEntry);
        res.status(200).send({ Node: raftNode.id, term: raftNode.currentTerm, success: true });
        return;
    }
    raftNode.heartbeatInterval();
    res.status(200).send('Heartbeat received!');
});

app.all('*', async function (req, res, next) {

    const userAgent = req.headers['user-agent'];

    console.log(userAgent);
    if (!userAgent.includes(axios)) {
        console.log('Request', req.protocol, req.method, req.url);
        let request = req;
        if (req.method === 'POST') {

            if (raftNode.state !== 'LEADER') {
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
    raftNode.init();
});