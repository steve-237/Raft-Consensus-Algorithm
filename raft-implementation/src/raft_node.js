const RaftNode = require('./raft'),
    express = require('express'),
    os = require('os'),
    app = express(),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    raftStates = require('./raftStates'),
    axios = require('axios'),
    { v4: uuidv4 } = require('uuid'),
    NODE_ID = parseInt(process.argv[2]),
    raftNode = new RaftNode(NODE_ID),
    PORT = 3000 + NODE_ID;

let serversId = [];
let responseMap = new Map();

app.use(express.json({ limit: '10mb' })); //increase the size of the parsed payload in the body of a request

app.post('/update', (req, res) => {
    serversId = req.body.registeredNodes;
    console.log('Updated server list received:', serversId);
    raftNode.nodes = serversId;
    res.sendStatus(200);
});

/**
 * Checks the availability of a Node
 */
app.get('/isAvailable', (req, res) => {
    res.status(200).send(true);
});

/**
 * Handles the request for voting from a candidate node.
 * Responds to the candidate with a vote grant or denial based on the Raft protocol.
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
 * Handles the request for appending entries from the leader node.
 */
app.post('/append-entries', async (req, res) => {
    const { term, leaderId, leaderIpAddress, prevLogIndex, prevLogTerm, entries, leaderCommitIndex } = req.body;

    raftNode.leaderId = leaderId;
    raftNode.leaderIpAddress = leaderIpAddress;
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
            console.log(`The new log entry has been applied on the ${raftNode.state}`);

            delete prevLogEntry.request.headers.host;
            prevLogEntry.request.headers.host = `localhost:${PORT}`;

            axios.post(prevLogEntry.request.url, prevLogEntry.request.body, {
                headers: prevLogEntry.request.headers,
                maxRedirects: 0,
                validateStatus: null,
            }).then((response) => {

                let responseObject = responseMap.get(prevLogEntry.request.headers.requestid);

                if (responseObject) {
                    responseObject.writeHead(response.status, response.headers);
                    responseObject.end(response.data);
                    responseMap.delete(prevLogEntry.request.headers.requestid);
                }
            }).catch(error => {
                console.error('Error applying the request to the application:', error.message);
            });
        }
    }
    res.status(200).json({ Node: raftNode.id, term: raftNode.currentTerm, success: true });
    raftNode.resetTimer();
});

/**
 * Middleware to intercept all incoming request messages.
 */
app.all('*', async function (req, res, next) {

    const userAgent = req.headers['user-agent'];
    let requestId = null;

    //Handles client request
    if (!userAgent.includes('axios')) {

        console.log('Request', req.protocol, req.method, req.url);

        let request = {};

        if (req.method === 'POST') {

            if (raftNode.state !== 'LEADER') {

                //generate random ID for each POST request
                requestId = uuidv4();
                responseMap.set(requestId, res);

                console.log(`Redirection of the request to the leader: Node${raftNode.leaderId}`);
                req.headers['requestid'] = requestId;

                proxy.web(req, res, {
                    target: `${req.protocol}://${raftNode.leaderIpAddress}:300${raftNode.leaderId}`,
                    selfHandleResponse: true
                });

            } else {
                let body = '';

                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {

                    request = {
                        hostname: req.hostname,
                        url: req.url,
                        body: body,
                        headers: req.headers,
                        path: req.path
                    };

                    try {
                        raftNode.receiveNewEntry(request);
                    } catch (error) {
                        console.error('Error appending the Log Entry:', error.message);
                        res.status(500).send('Error appending the Log Entry');
                    }

                });

                const checkMajority = setInterval(async () => {

                    console.log("Is Majority Confirmed ? = ", raftNode.majorityConfirmed);

                    if (raftNode.majorityConfirmed) {

                        clearInterval(checkMajority);

                        const response = await axios.post(request.url, request.body, {
                            headers: request.headers,
                            maxRedirects: 0,
                            validateStatus: null,
                        })

                        console.log('[Request Applied within the application.]', response.data);
                        res.writeHead(response.status, response.headers);
                        res.end(response.data)
                    }

                }, 500)
            }
        } else {
            proxy.web(req, res, { target: `${req.protocol}://${req.hostname}` });
        }
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`Node running on port ${PORT}`);

    const interfaceName = 'enp0s3';
    const ipAddress = getIPAddress(interfaceName);
    console.log(`IP address of ${interfaceName}: ${ipAddress}`);

    const nodeData = {
        nodeId: NODE_ID,
        nodeIpAddress: ipAddress
    };

    axios.post(`http://localhost:3006/register`, nodeData)
        .then(() => {
            console.log('Server registered with manager.');
        })
        .catch(error => {
            console.error('Error registering with manager:', error.message);
        });

    raftNode.init();
});

/**
 * Retrieves the IPv4 address of the specified network interface.
 * 
 * @param {string} interfaceName - The name of the network interface.
 * @returns {string} - The IPv4 address of the specified interface if found, otherwise an error message.
 */
function getIPAddress(interfaceName) {
    const networkInterfaces = os.networkInterfaces();

    if (networkInterfaces.hasOwnProperty(interfaceName)) {
        const interfaceInfo = networkInterfaces[interfaceName].find(info => info.family === 'IPv4');
        if (interfaceInfo) {
            return interfaceInfo.address;
        } else {
            return `No IPv4 address found for interface ${interfaceName}`;
        }
    } else {
        return `Interface ${interfaceName} not found`;
    }
}