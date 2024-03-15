const express = require('express'),
    axios = require('axios'),
    app = express(),
    registeredIds = new Set(),
    PORT = 3006;

let nodes = [];

app.use(express.json());

/**
 * 
 */
app.post('/register', (req, res) => {
    const { nodeId } = req.body;

    if (!registeredIds.has(nodeId)) {
        registeredIds.add(nodeId);
        console.log(`Server ${nodeId} registered.`);
        res.sendStatus(200);
        console.log(`Registered servers id : ${[...registeredIds]}`);

    } else {
        console.error(`Server ${nodeId} already registered.`);
        res.status(400).send(`Server ${nodeId} already registered.`);
    }

    registeredIds.forEach(id => {
        axios.post(`http://localhost:300${id}/update`, [...registeredIds])
            .then(response => {
                console.log(`Updated server list sent to ${id}`);
            })
            .catch(error => {
                console.error(`Error sending update to ${id}: ${error.message}`);
            });
    });
});

app.listen(PORT, () => {
    console.log(`Cluster manager running on port ${PORT}`);
});