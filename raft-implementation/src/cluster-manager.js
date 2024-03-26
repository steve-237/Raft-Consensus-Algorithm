const express = require('express'),
    axios = require('axios'),
    app = express(),
    registeredNodes = new Set(),
    PORT = 3006;

app.use(express.json());

/**
 * Handles registration of nodes with the server.
 * Upon receiving a POST request to '/register', this endpoint expects JSON data containing 'nodeId' and 'nodeIpAddress'.
 * It checks if the node is already registered, and if not, adds it to the list of registered nodes.
 * Sends a success response if registration is successful, otherwise logs an error.
 * Updates all connected nodes with the current list of registered nodes.
 * 
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 */
app.post('/register', (req, res) => {
    const { nodeId, nodeIpAddress } = req.body;

    const nodeInfo = { nodeId, nodeIpAddress };

    if (!isNodeRegistered(nodeInfo)) {
        registeredNodes.add(nodeInfo);
        console.log(`Server ${nodeId} registered with IP address ${nodeIpAddress}.`);
        res.sendStatus(200);
        console.log(`Registered servers: `, Array.from(registeredNodes));
    } else {
        console.error(`Server ${nodeId} already registered.`);
    }

    const registeredNodesList = Array.from(registeredNodes);
    sendRegisteredNodesToAll(registeredNodesList);
});

app.listen(PORT, () => {
    console.log(`Cluster manager running on port ${PORT}`);
});

/**
 * Checks if a node is already registered.
 * 
 * @param {object} nodeInfo - Information about the node (ID + Ip Address).
 * @returns - True if the node is already registered, otherwise false.
 */
function isNodeRegistered(nodeInfo) {
    for (const registeredNode of registeredNodes) {
        if (registeredNode.nodeId === nodeInfo.nodeId) {
            return true;
        }
    }
    return false;
}

/**
 * Sends the list of registreted nodes to all nodes.
 * 
 * @param {object} registeredNodesList - List of registreted nodes
 */
function sendRegisteredNodesToAll(registeredNodesList) {
    for (const nodeInfo of registeredNodes) {
        console.log(nodeInfo.nodeIpAddress);
        axios.post(`http://${nodeInfo.nodeIpAddress}:300${nodeInfo.nodeId}/update`, { registeredNodes: registeredNodesList })
            .then(response => {
                console.log(`Updated server list sent to Node${nodeInfo.nodeId}`);
            })
            .catch(error => {
                console.error(`Error sending update to ${nodeInfo.nodeId}: ${error.message}`);
            });
    }
}