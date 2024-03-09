const LogEntry = require('./logEntry');

class Log {
    constructor() {
        this.firstIndex = 0;
        this.log = [];
    }

    addEntry(entry){
        this.log.push(entry);
        console.log(this.log);
    }

    getEntry(index){
        let offset = index - this.startIndex;
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

    getEntriesFrom(startIndex){
        let lastIndex = this.getLastIndex();
        let entries = new Array(lastIndex - startIndex +1);
        for(let i = 0; i < entries.length; i++) {
            entries[i] = this.getEntry(startIndex + i);
        }
        return entries;
    }

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
            this.log.addEntry(entry);
        }
    }
}

module.exports = Log;