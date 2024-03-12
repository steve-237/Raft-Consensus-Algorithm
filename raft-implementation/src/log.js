const LogEntry = require('./logEntry');

/**
 * Handle log.
 */
class Log {
    constructor() {
        this.firstIndex = 0;
        this.log = [];
        this.initLog(0, 0);
    }

    /**
     * Appends a new Entry in the log.
     * @param {objet} entry - New entry
     */
    addEntry(entry){
        this.log.push(entry);
        console.log(this.log);
    }

    getEntry(index){
        let offset = index - this.firstIndex;
        if(offset >= this.log.length || offset < 0){
            return null;
        }
        return this.log[offset];
    }

    getLastEntry(){
        if (this.log.length === 0) {
            return 0; 
        }
        return this.log[this.log.length - 1];
    }
    
    getLastIndex(){
        const lastEntry = this.getLastEntry();
        return lastEntry ? lastEntry.index : 0; 
    }
    
    getLastTerm(){
        const lastEntry = this.getLastEntry();
        return lastEntry ? lastEntry.term : 0; 
    }
    getFirstIndex(){
        return this.firstIndex;
    }

    getLogLength(){
        return this.log.length;
    }

    /**
     * Gets list of entries from an index.
     * @param {number} startIndex - Index from where the entries must be fetch.
     * @returns - List of entries.
     */
    getEntriesFrom(startIndex){
        let lastIndex = this.getLastIndex();
        let entries = new Array(lastIndex - startIndex +1);
        for(let i = 0; i < entries.length; i++) {
            entries[i] = this.getEntry(startIndex + i);
        }
        return entries;
    }

    /**
     * Saves new logs entries
     * @param {object} entries - New log entries to store.
     */
    storeEntries(entries) {
        for(const entry of entries) {
            const offset = entry.index - this.firstIndex;
            if(offset < 0){
                throw  new Error("Index is smaller than the first index of the log");
            }
            if(entry.request === null) {
                throw new Error("Entries will not be transferred");
            }
            if(offset < this.log.length) {
                if(this.log[offset].equals(entry)){
                    continue;
                }
                for(let i = this.log.length -1; i >= offset; i--) {
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
    initLog(index, term){
        if (this.log.length === 0) {
            this.log = [new LogEntry(index, term, null)];
        } 
    }
}

module.exports = Log;