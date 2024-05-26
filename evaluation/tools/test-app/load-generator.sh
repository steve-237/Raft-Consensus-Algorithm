#!/bin/bash

if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ] || [ "$#" -lt 4 ]; then
    echo "Usage: $0 WRITE_PERCENTAGE READ_PERCENTAGE TOTAL_REQUESTS SERVER1_PCT [SERVER2_PCT ...]"
    echo "  WRITE_PERCENTAGE: Percentage of write requests (additions)"
    echo "  READ_PERCENTAGE: Percentage of read requests (retrieve results)"
    echo "  TOTAL_REQUESTS: Total number of requests to send"
    echo "  SERVER_PCT: Percentage of total requests sent to each server (e.g., 30 for server1, 20 for server2, 50 for server3,...)"
    exit 1
fi

WRITE_PERCENTAGE=$1
READ_PERCENTAGE=$2
TOTAL_REQUESTS=$3

declare -a SERVER_URLS=("http://localhost:3001" "http://localhost:3002" "http://localhost:3003")
declare -a SERVER_REQUESTS
declare -a SERVER_PCTS=(${@:4}) #Slices all arguments from position 4 as server percentage

for pct in "${SERVER_PCTS[@]}"; do
    requests=$(echo "$TOTAL_REQUESTS * $pct / 100" | bc)
    SERVER_REQUESTS+=($requests)
done

send_requests() {
    local server=$1
    local total=$2
    local write_count=$((total * WRITE_PERCENTAGE / 100))
    local read_count=$((total - write_count))
    local id=1
    local start_time
    local end_time
    local duration
    local write_time=0
    local read_time=0

    echo "Sending requests to $server..."

    for ((i=0; i<write_count; i++)); do
        start_time=$(date +%s%3N)
        curl -s -X POST "$server/index.php" -d "number1=$RANDOM&number2=$RANDOM&operation=addition" -o /dev/null
        end_time=$(date +%s%3N)
        duration=$((end_time - start_time))
        write_time=$((write_time + duration))
    done

    for ((i=0; i<read_count; i++)); do
        start_time=$(date +%s%3N)
        curl -s -X GET "$server/index.php?id=$id" -o /dev/null
        end_time=$(date +%s%3N)
        duration=$((end_time - start_time))
        read_time=$((read_time + duration))
        ((id++))
    done

    echo "Server: $server" >> reports.txt
    echo "Total requests: $total" >> reports.txt
    echo "Write requests (addition): $write_count" >> reports.txt
    echo "Read requests (results): $read_count" >> reports.txt
    echo "Total write time: $write_time ms" >> reports.txt
    echo "Total read time: $read_time ms" >> reports.txt
    echo "Average write time per request: $((write_time / write_count)) ms" >> reports.txt
    echo "Average read time per request: $((read_time / read_count)) ms" >> reports.txt
    echo "" >> reports.txt
}

for i in "${!SERVER_URLS[@]}"; do
    if [ $i -lt ${#SERVER_REQUESTS[@]} ]; then
        send_requests ${SERVER_URLS[$i]} ${SERVER_REQUESTS[$i]}
    fi
done

echo "Requests have been sent to the servers and results stored in reports.txt"
