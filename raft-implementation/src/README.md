# Raft Consensus Algorithm Implementation

This code implements the Raft consensus algorithm for distributed systems.

## Setup Instructions

1. Install Node.js if you haven't already.
2. Clone this repository.
3. Navigate to the project directory in your terminal.
4. Install dependencies using `npm install`.

## Project Structure

- `cluster-manager.js`: Manages registration and updates of servers in the cluster.
- `raft.js`: Implements the Raft node functionality.
- `raft-node.js`: Main file that sets up the Raft node and starts the server.
- `raftStates.js`: Contains constants defining the states of a Raft node.
- `log.js`: Manages logs on each node.
- `logEntry.js`: Defines the structure of log entries.

## Running the Code

After following the setup instructions:

1. Start the cluster manager by running `node cluster-manager.js`.
1. Start the Raft node by running `node raft-node.js <node_id>`, where `<node_id>` is the unique identifier of the node.
2. The node will listen for incoming requests and participate in the Raft consensus algorithm.

## Endpoints

- `POST /update`: Receives updated server lists from the cluster manager.
- `GET /isAvailable`: Checks the availability of the node.
- `POST /requestVote`: Handles voting requests from candidate nodes based on the Raft protocol.
- `POST /append-entries`: Handles append entries requests from the leader node.
- `POST /register`: Registers new nodes with the cluster manager.
- All other requests are intercepted and redirected as necessary.

For more information on Raft, refer to the original research paper by Diego Ongaro and John Ousterhout: [Raft: In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf).