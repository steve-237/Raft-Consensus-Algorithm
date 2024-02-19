const express = require('express'),
    axios = require('axios'),
    app = express(),
    PORT = 3004,
    nodes = [1, 2, 3];

var leader = null,
    leaderIsAvailable = false;

app.use(express.json());

app.post('/send-leader-id', (req, res) => {
    const { leaderId } = req.body;
    leader = leaderId;
    console.log(`The leader is Node${leader}`);
    res.status(200).send('Leader ID received');
});

app.get('/leaderId', (req, res) => {
    res.status(200).send(leaderIsAvailable);
})

app.get('/leader', (req, res) => {
    console.log(leader);
    res.status(200).send(leader.toString());
})

//send the list of server ID of the raft cluster
app.get('/cluster/nodes', (req, res) => {
    res.status(200).send(nodes);
});

//check after each 5s if a leader server is available 
setInterval(async () => {
    if (leader !== null) {
        console.log(`Checking leader availability...`);
        try {
            const response = await axios.get(`http://localhost:300${leader}/isAvailable`);
            leaderIsAvailable = true;
            console.log(`Leader Node ${leader} is available.`);
        } catch (error) {
            leaderIsAvailable = false;
            console.log(`Leader Node ${leader} is not available, triggering new leader election...`);
            triggerNewLeaderElection();
        }
    }
}, 5000);

//trigger the election of a new leader server if the previous leader is not anymore available
function triggerNewLeaderElection() {
    nodes.forEach(nodeId => {
        axios.post(`http://localhost:300${nodeId}/start-election`,)
            .then(response => {
            })
            .catch(error => {
                console.error(`Failed to start a new leader election on Node ${nodeId}:`, error.message);
            });
    });
}

app.listen(PORT, () => {
    console.log(`Cluster manager running on port ${PORT}`);
});