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

declare -a SERVER_URLS=("http://localhost:3001" "http://localhost:3002" "http://localhost:3003" "http://localhost:3004")
declare -a SERVER_REQUESTS
declare -a SERVER_PCTS=(${@:4}) 

for pct in "${SERVER_PCTS[@]}"; do
    requests=$(echo "$TOTAL_REQUESTS * $pct / 100" | bc)
    SERVER_REQUESTS+=($requests)
done

mkdir -p results

for i in "${!SERVER_URLS[@]}"; do
    server_name="s$((i+1))"
    echo "Server,Type,Response Time,Status Code,Thoughput,Duration" > "results/$server_name-post.csv"
    echo "Server,Type,Response Time,Status Code,Thoughput,Duration" > "results/$server_name-get.csv"
done

send_requests() {
    local server=$1
    local server_name=$2
    local total=$3

    if [ "$total" -eq 0 ]; then
        echo "Skipping server $server_name as total requests are 0."
        return
    fi

    local write_count=$((total * WRITE_PERCENTAGE / 100))
    local read_count=$((total - write_count))
    local total_requests=$((write_count + read_count))
    local id=1
    local count=0

    echo "Sending requests to $server ..."

    local post_start_time=$(date +%s)

    for ((i=0; i<write_count; i++)); do
        response=$(curl -s -w "%{http_code},%{time_total}" -o /dev/null -X POST "$server/index.php" -d "number1=$RANDOM&number2=$RANDOM&operation=addition")
        request_time=$(echo $response | cut -d',' -f2)
        status_code=$(echo $response | cut -d',' -f1)
        echo "$server_name,POST,$request_time,$status_code," >> "results/$server_name-post.csv"
        ((count++))
        printf "\rProgress: %3d%%" $((count * 100 / total_requests))
    done

    local post_end_time=$(date +%s)

    local post_duration_s=$((post_end_time - post_start_time))
    local post_throughput=$(bc <<< "scale=2; if ($post_duration_s > 0) $write_count / $post_duration_s else 0")

    sed -i "2,\$s/,$/,${post_throughput},${post_duration_s}/" "results/$server_name-post.csv"
    
    local get_start_time=$(date +%s)

    for ((i=0; i<read_count; i++)); do
        response=$(curl -s -w "%{http_code},%{time_total}" -o /dev/null -X GET "$server/index.php?id=$id")
        request_time=$(echo $response | cut -d',' -f2)
        status_code=$(echo $response | cut -d',' -f1)
        echo "$server_name,GET,$request_time,$status_code," >> "results/$server_name-get.csv"
        ((count++))
        printf "\rProgress: %3d%%" $((count * 100 / total_requests))
    done

    local get_end_time=$(date +%s)

    local get_duration_s=$((get_end_time - get_start_time))
    local get_throughput=$(bc <<< "scale=2; if ($get_duration_s > 0) $read_count / $get_duration_s else 0")

    sed -i "2,\$s/,$/,${get_throughput},${get_duration_s}/" "results/$server_name-get.csv"

    echo -ne "\n"

    echo "Server: $server_name, POST Duration: $post_duration_s seconds, POST Throughput: $post_throughput requests/second" >> "results/$server_name-throughput.txt"
    echo "Server: $server_name, GET Duration: $get_duration_s seconds, GET Throughput: $get_throughput requests/second" >> "results/$server_name-throughput.txt"
}

for i in "${!SERVER_URLS[@]}"; do
    if [ $i -lt ${#SERVER_REQUESTS[@]} ]; then
        send_requests ${SERVER_URLS[$i]} "s$((i+1))" ${SERVER_REQUESTS[$i]}
    fi
done

for i in "${!SERVER_URLS[@]}"; do
    server_name="s$((i+1))"
    for type in "post" "get"; do
        echo "| Server | Type | Response Time | Status Code | Throughput | Duration |" > "results/$server_name-$type.md"
        echo "|--------|------|---------------|-------------|------------|----------|" >> "results/$server_name-$type.md"
        tail -n +2 "results/$server_name-$type.csv" | awk -F',' '{ print "| " $1 " | " $2 " | " $3 " | " $4 " | " $5 " | " $6 " |"; }' >> "results/$server_name-$type.md"
    done
done

echo "Requests have been sent to the servers and results stored in the ordner results"

echo "Starts plots generation..."

python3 convert_to_pdf.py