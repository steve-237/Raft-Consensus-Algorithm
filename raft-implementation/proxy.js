const express = require('express'),
    httpProxy = require('http-proxy'),
    proxy = httpProxy.createProxyServer({}),
    axios = require('axios'),
    app = express(),
    port = 3000;

app.use(express.json());

app.all('*', function (req, res) {
    console.log('Request', req.protocol, req.method, req.url);

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            console.log("Chunk start:" + chunk + ": Chunk end.");
            body += chunk.toString();
        });
        req.on('end', async () => {
            const data = body.toString();
            console.log(data);
            console.log('Data to be processed with Raft:', data);

            try {
                const leaderId = await getLeaderIdFromClusterManager();
                console.log('Leader ID:', leaderId);

                const response = await sendToLeader(leaderId, data);

                if (response.status === 200) {
                    proxy.web(req, res, { target: `${req.protocol}://${req.hostname}` });
                } else {
                    console.error('Error processing command with Raft:', response.error);
                    res.status(500).send('Error processing command with Raft');
                }
            } catch (error) {
                console.error('Error processing command with Raft in the proxy file:', error.message);
                res.status(500).send('Error processing command with Raft');
            }
        });
    }
    proxy.web(req, res, { target: `${req.protocol}://${req.hostname}` });
});

//get the ID of the current leader
async function getLeaderIdFromClusterManager() {
    try {
        const response = await axios.get(`http://localhost:3004/leader`);
        return parseInt(response.data);
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

//send the new log to the leader
async function sendToLeader(leaderId, data) {
    try {
        const response = await axios.post(`http://localhost:300${leaderId}/append-log`, data);
        console.log('Append log request sent to leader:', leaderId);
        return response.data;
    } catch (error) {
        console.error('Error sending append log request to leader:', error.message);
        throw error;
    }
}

app.listen(port, () => {
    console.log(`Proxy is launched on port: ${port}`);
})
