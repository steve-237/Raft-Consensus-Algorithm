const express = require('express'),
    axios = require('axios'),
    app = express(),
    PORT = 3004,
    nodes = [1, 2, 3];

app.use(express.json());

//send the list of server ID of the raft cluster
app.get('/cluster/nodes', (req, res) => {
    res.status(200).send(nodes);
});

app.listen(PORT, () => {
    console.log(`Cluster manager running on port ${PORT}`);
});