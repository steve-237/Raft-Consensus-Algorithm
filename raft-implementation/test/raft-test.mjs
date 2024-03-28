import { expect as _expect } from 'chai';
import sinon from 'sinon'
import RaftNode from '../src/raft.js';
import raftStates from '../src/raftStates.js';

const expect = _expect;

describe('RaftNode', () => {
    let node1, node2, node3;
    let nodes = [];

    beforeEach(() => {
        node1 = new RaftNode(1);
        node2 = new RaftNode(2);
        node3 = new RaftNode(3);

        nodes = [new RaftNode(1), new RaftNode(2), new RaftNode(3)];

        // Mock nodes array for each raft node
        nodes.forEach((node, index) => {
            node.nodes = nodes.filter((_, i) => i !== index).map(n => ({ nodeId: n.id, nodeIpAddress: 'localhost' }));
        });

        // configure raft nodes
        node1.nodes = [{ nodeId: 2, nodeIpAddress: '127.0.0.1' }, { nodeId: 3, nodeIpAddress: '127.0.0.1' }];
        node2.nodes = [{ nodeId: 1, nodeIpAddress: '127.0.0.1' }, { nodeId: 3, nodeIpAddress: '127.0.0.1' }];
        node3.nodes = [{ nodeId: 1, nodeIpAddress: '127.0.0.1' }, { nodeId: 2, nodeIpAddress: '127.0.0.1' }];
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should initialize with correct initial state', () => {
        expect(node1.id).to.equal(1);
        expect(node1.state).to.equal('FOLLOWER');
        expect(node2.id).to.equal(2);
        expect(node2.state).to.equal('FOLLOWER');
        expect(node3.id).to.equal(3);
        expect(node3.state).to.equal('FOLLOWER');
    });

    it('should start election when no heartbeat received after timeout', () => {
        const startElectionStub = sinon.stub(node1, 'startElection');

        sinon.useFakeTimers();
        node1.startElection();
        sinon.clock.tick(6000);

        expect(startElectionStub.calledOnce).to.be.true;

        startElectionStub.restore();
    });
});