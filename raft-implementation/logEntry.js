class LogEntry {
    constructor(index, term, request) {
        this.index = index;
        this.term = term;
        this.request = request;
    }
}

module.exports = LogEntry;