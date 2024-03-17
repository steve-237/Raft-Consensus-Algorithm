const RaftNode = require('./raft'),
    express = require('express'),
    app = express(),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    raftStates = require('./raftStates'),
    axios = require('axios'),
    NODE_ID = parseInt(process.argv[2]),
    raftNode = new RaftNode(NODE_ID);

    let serversId = [];

app.use(express.json({ limit: '10mb' })); //increase the size of the parsed payload in the body of a request

app.post('/update', (req, res) => {
    serversId = req.body;
    console.log('Updated server list received:', serversId);
    raftNode.nodes = serversId;
    res.sendStatus(200);
});

/**
 * This route checks the availability of a Node
 */
app.get('/isAvailable', (req, res) => {
    res.status(200).send(true);
});

/**
 * Handles a vote request send by a candidate.
 */
app.post('/requestVote', (req, res) => {
    const { candidateId, candidateTerm, candidateLastLogIndex, candidateLastLogTerm, candidateLogLength } = req.body;
    console.log(`received from candidate ${candidateId}, ${candidateTerm}, ${candidateLastLogIndex}, ${candidateLastLogTerm}, ${candidateLogLength}`)
    raftNode.stopTimer();

    console.log(`Vote request received from ${candidateId} at term ${raftNode.currentTerm} of Node${raftNode.id}`);

    const lastLog = raftNode.log.getLastEntry();
    const lastTerm = lastLog ? lastLog.term : 0;

    //const logOk = candidateLastLogTerm > lastTerm || (candidateLastLogTerm === lastTerm && candidateLogLength >= raftNode.log.getLogLength());

    if (candidateTerm < raftNode.currentTerm || raftNode.votedFor !== null && raftNode.votedFor !== candidateId) {
        if (candidateTerm > raftNode.currentTerm) {
            raftNode.currentTerm = candidateTerm;
            raftNode.setState(raftStates.FOLLOWER);
        }
        res.status(200).json({ nodeId: raftNode.id, voteGranted: false, term: raftNode.currentTerm });
    } else {
        raftNode.currentTerm = candidateTerm;
        raftNode.votedFor = candidateId;
        raftNode.setState(raftStates.FOLLOWER);
        res.status(200).json({ nodeId: raftNode.id, voteGranted: true, term: raftNode.currentTerm });
    }
});

/**
 * Handles the reception of a heartbeat from the leader.
 */
/*app.post('/receive-heartbeat', (req, res) => {
    const { term, leaderId, newLogEntry, lastLogIndex, lastLogTerm, leaderCommitIndexIndex } = req.body;
    raftNode.stopTimer();
    raftNode.leaderId = leaderId;
    raftNode.setState(raftStates.FOLLOWER);
    raftNode.votedFor = null;

    console.log("Heartbeat received from Node" + leaderId + " at term " + term);
    console.log(`[Node${raftNode.id}] currentTerm = ${raftNode.currentTerm}`);

    if (term > raftNode.currentTerm) {
        raftNode.currentTerm = term;
        raftNode.setState(raftStates.FOLLOWER);
    }


    if (newLogEntry !== null) {
        /* if (lastLogIndex < raftNode.log.getLogLength() && raftNode.log.getLastEntry().term === lastLogTerm) {
            if (raftNode.log.getLastEntry().term !== newLogEntry.term) {
                raftNode.log.splice(lastLogIndex);
            }
        }

        if (leaderCommitIndexIndex > raftNode.commitIndex) {
            const lastIndex = Math.min(leaderCommitIndexIndex, raftNode.log.length - 1);
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
        } 
        raftNode.log.addEntry(newLogEntry);
        res.status(200).send({ Node: raftNode.id, term: raftNode.currentTerm, success: true });
        return;
    }
    raftNode.resetTimer();
    res.status(200).send('Heartbeat received!');
});
*/

app.post('/append-entries', async (req, res) => {
    const { term, leaderId, prevLogIndex, prevLogTerm, entries, leaderCommitIndex } = req.body;

    raftNode.leaderId = leaderId;
    raftNode.setState(raftStates.FOLLOWER);
    raftNode.votedFor = null;

    const prevLogEntry = raftNode.log.getEntry(prevLogIndex);
    console.log("previous log for Follower node : ", prevLogEntry);
    if (term < raftNode.currentTerm || (entries && (!prevLogEntry || prevLogEntry.term !== prevLogTerm))) {
        console.log(`Append from ${leaderId} rejected`);
        res.status(200).json({ Node: raftNode.id, term: raftNode.currentTerm, success: false });
        return;
    }

    if (!entries)
        console.log(`Heartbeat from ${leaderId} received`);
    else
        console.log(`Append from ${leaderId} received`);

    raftNode.currentTerm = term;

    if (entries) {
        raftNode.log.storeEntries(entries);
    }

    console.log('Leader Commit ', leaderCommitIndex);

    if (leaderCommitIndex > raftNode.commitIndex) {
        console.log(`leaderCommitIndex: ${leaderCommitIndex}; commitIndex: ${raftNode.commitIndex} lastApplied: ${raftNode.lastApplied}`);

        raftNode.commitIndex = Math.min(leaderCommitIndex, raftNode.log.getLastIndex());

        // Apply entries to the state Machine here
        while (raftNode.lastApplied < raftNode.commitIndex) {
            raftNode.lastApplied++;
            console.log(`Apply: ${raftNode.lastApplied}`);
            console.log(`The new log has been applied on the ${raftNode.state}`);
            //proxy.web(request, res, { target: `${req.protocol}://${req.hostname}` });
        }
    }
    res.status(200).json({ Node: raftNode.id, term: raftNode.currentTerm, success: true });
    raftNode.resetTimer();
});

/**
 * Middleware to intercepts all requests.
 */
app.all('*', async function (req, res, next) {

    const userAgent = req.headers['user-agent'];

    console.log(userAgent);

    //Handles client request
    if (!userAgent.includes('axios')) {
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
                    try {
                        raftNode.receiveNewEntry(request);
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
    axios.post(`http://localhost:3006/register`, {nodeId: NODE_ID})
        .then(response => {
            console.log('Server registered with manager.');
        })
        .catch(error => {
            console.error('Error registering with manager:', error.message);
        });
    raftNode.init();
});