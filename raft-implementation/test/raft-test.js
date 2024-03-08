const assert = require('assert');
const app = require('../src/raft');
const request = require('supertest')(app);
const RaftNode = require('../src/raft');
const raftNode = new RaftNode(1);

describe('Raft Module', function() {
    it('should respond with status 200 on GET /isAvailable', function(done) {
        request.get('/isAvailable')
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                assert.strictEqual(res.text, 'Yes');
                done();
            });
    });
});