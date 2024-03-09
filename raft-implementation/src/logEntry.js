class LogEntry {
    constructor(index, term, request) {
        this.index = index;
        this.term = term;
        this.request = request;
    }

    //compare log entries
    equals(entry) {
        return (
            this.index === entry.index &&
            this.term === entry.term &&
            this.request === entry.request
        )
    }
}

module.exports = LogEntry;