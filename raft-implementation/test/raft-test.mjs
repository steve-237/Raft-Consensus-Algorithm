import { expect as _expect } from 'chai';
import sinon from 'sinon'
import RaftNode from '../src/raft.js';

const expect = _expect;

describe('RaftNode', () => {
    let node1, node2, node3;

    beforeEach(() => {
        node1 = new RaftNode(1);
        node2 = new RaftNode(2);
        node3 = new RaftNode(3);

        // Configuration des nœuds pour former un cluster
        node1.nodes = [2, 3];
        node2.nodes = [1, 3];
        node3.nodes = [1, 2];
    });

    afterEach(() => {
    });

    it('should initialize with correct initial state', () => {
        expect(node1.id).to.equal(1);
        expect(node1.state).to.equal('follower');
        expect(node2.id).to.equal(2);
        expect(node2.state).to.equal('follower');
        expect(node3.id).to.equal(3);
        expect(node3.state).to.equal('follower');
    });

    it('should start election when no heartbeat received after timeout', () => {
        const startElectionStub = sinon.stub(node1, 'startElection');

        // Advance time to simulate election timeout
        sinon.useFakeTimers();
        node1.startElectionTimeout();
        sinon.clock.tick(2000);

        expect(startElectionStub.calledOnce).to.be.true;

        startElectionStub.restore();
        sinon.restore();
    });

    it('should start election across nodes', () => {

        node1.startElection();
        node2.startElection();
        node3.startElection();

        expect(node1.state).to.equal('candidate');
        expect(node2.state).to.equal('candidate');
        expect(node3.state).to.equal('candidate');
    });

});