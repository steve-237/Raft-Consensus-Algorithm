const LogEntry = require('./logEntry');

/**
 * Handle log of each node.
 */
class Log {
    constructor() {

        /**
         * Log
         * @type {LogEntry[]}
         */
        this.log = [];
        this.initLog(0, 0);
    }

    /**
     * Store a new Entry in the log.
     * @param {object} entry - New entry
     */
    addEntry(entry) {
        this.log.push(entry);
    }

    /**
     * Get the log
     * @returns - Log
     */
    getLog() {
        return this.log;
    }

    /**
     * Get a log entry
     * @param {number} index - Index of the log entry to retrieve
     * @returns - A log entry
     */
    getEntry(index) {
        if (index >= this.log.length || index < 0) {
            return null;
        }
        return this.log[index];
    }

    /**
     * Get the last last log entry
     * @returns - Log entry
     */
    getLastEntry() {
        if (this.log.length === 0) {
            return 0;
        }
        return this.log[this.log.length - 1];
    }

    /**
     * Get the index of the last log entry
     * @returns - Index of the last log entry
     */
    getLastIndex() {
        const lastEntry = this.getLastEntry();
        return lastEntry ? lastEntry.index : 0;
    }

    /**
     * Get the term of the last log entry
     * @returns - Term of the last log entry
     */
    getLastTerm() {
        const lastEntry = this.getLastEntry();
        return lastEntry ? lastEntry.term : 0;
    }

    /**
     * Get the fisrt index in the log
     * @returns - First term
     */
    getFirstIndex() {
        return 1;
    }

    /**
     * Get the length of the log
     * @returns - The length of the log
     */
    getLogLength() {
        return this.log.length;
    }

    /**
     * Gets list of entries from an index.
     * @param {number} startIndex - Index from where the entries must be fetch.
     * @returns - List of entries.
     */
    getEntriesFrom(startIndex) {
        let lastIndex = this.getLastIndex();
        let entries = new Array(lastIndex - startIndex + 1);
        for (let i = 0; i < entries.length; i++) {
            entries[i] = this.getEntry(startIndex + i);
        }
        return entries;
    }

    loadLog(data) {
        this.log = data;
    }

    /**
     * Saves new logs entries
     * @param {object} entries - New log entries to store.
     */
    storeEntries(entries) {
        for (const entry of entries) {
            if (entry.index  < 0) {
                return;
            }
            if (entry.index  < this.log.length) {
                if (this.log[entry.index ].index === entry.index &&
                    this.log[entry.index ].term === entry.term &&
                    this.log[entry.index ].request === entry.request) {
                    continue;
                }
                for (let i = this.log.length - 1; i >= entry.index ; i--) {
                    this.log.pop();
                }
            }
            this.addEntry(entry);
        }
    }

    /**
     * Initialises the log of each each Node.
     * @param {number} index - initiale index
     * @param {number} term - initiale term
     */
    initLog(index, term) {
        if (this.log.length === 0) {
            this.log = [new LogEntry(index, term, null)];
        }
    }
}

module.exports = Log;