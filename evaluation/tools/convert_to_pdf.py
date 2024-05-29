import os
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer
from reportlab.lib import colors

results_dir = "results"
output_dir = "plot_result"
os.makedirs(output_dir, exist_ok=True)

result_files = sorted([f for f in os.listdir(results_dir) if f.endswith(".csv")])
total_files = len(result_files)

plot_colors = ['red', 'blue', 'green', 'purple']

data_summary = {'POST': {}, 'GET': {}}
error_summary = {'POST': {}, 'GET': {}}

print(f"Processing {total_files} files...")

for index, file in enumerate(result_files):
    print(f"Processing file {index +1} of {total_files}: {file}")
    data = pd.read_csv(os.path.join(results_dir, file))

    data.columns = data.columns.str.strip()

    if data.empty:
        print(f"Warning: No data in file {file}")
        continue

    if 'Server' not in data.columns:
        print(f"Error: 'Server' column not found in {file}")
        continue

    data.columns = ['Server', 'Type', 'Response Time', 'Status Code', 'Throughput', 'Duration']

    server = data['Server'].unique()[0]
    request_type = file.split('-')[-1].split('.')[0].upper()

    if server not in data_summary[request_type]:
        data_summary[request_type][server] = data
    else:
        data_summary[request_type][server] = pd.concat([data_summary[request_type][server], data])

    error_summary[request_type][server] = data[data['Status Code'] >= 400].shape[0] / data.shape[0]

#graph for duration and throughput
servers = list(set([server for request_type in data_summary for server in data_summary[request_type]]))
post_durations = [data_summary['POST'][server]['Duration'].iloc[0] for server in servers]
post_throughputs = [data_summary['POST'][server]['Throughput'].iloc[0] for server in servers]
get_durations = [data_summary['GET'][server]['Duration'].iloc[0] for server in servers]
get_throughputs = [data_summary['GET'][server]['Throughput'].iloc[0] for server in servers]

fig, ax1 = plt.subplots()

ax1.set_xlabel('Server')
ax1.set_ylabel('Duration (seconds)', color='tab:blue')
width = 0.35

x = range(len(servers))
ax1.bar([p - width/2 for p in x], post_durations, width, color='tab:blue', align='center', label='POST Duration')
ax1.bar([p + width/2 for p in x], get_durations, width, color='tab:cyan', align='center', label='GET Duration')
ax1.tick_params(axis='y', labelcolor='tab:blue')
ax1.set_xticks(x)
ax1.set_xticklabels(servers)

ax2 = ax1.twinx()
ax2.set_ylabel('Throughput (requests/second)', color='tab:red')
ax2.plot(x, post_throughputs, color='tab:red', marker='o', linestyle='-', label='POST Throughput')
ax2.plot(x, get_throughputs, color='tab:orange', marker='o', linestyle='-', label='GET Throughput')
ax2.tick_params(axis='y', labelcolor='tab:red')

fig.tight_layout()
fig.suptitle('Server: Duration and Throughput', y=1.05)
ax1.legend(loc='upper left')
ax2.legend(loc='upper right')

plt.savefig(os.path.join(output_dir, 'server_duration_throughput.pdf'))
plt.close()

#graph for average time for each request type on each server
for request_type in ['POST', 'GET']:
    plt.figure()
    avg_response_times = {server: data['Response Time'].mean() for server, data in data_summary[request_type].items()}
    plt.bar(avg_response_times.keys(), avg_response_times.values(), color=plot_colors[:len(avg_response_times)])
    plt.xlabel('Server')
    plt.ylabel('Average Response Time (second)')
    plt.title(f'Average Response Time for {request_type} Requests')
    plt.xticks(rotation=45)
    plt.savefig(os.path.join(output_dir, f'avg_response_time_{request_type}.pdf'))
    plt.close()

#boxplot
for request_type in ['POST', 'GET']:
    plt.figure()
    data_to_plot = [data['Response Time'] for data in data_summary[request_type].values()]
    plt.boxplot(data_to_plot, labels=data_summary[request_type].keys())
    plt.xlabel('Server')
    plt.ylabel('Response Time (second)')
    plt.title(f'Response Time Distribution for {request_type} Requests')
    plt.xticks(rotation=45)
    plt.savefig(os.path.join(output_dir, f'boxplot_response_time_{request_type}.pdf'))
    plt.close()

#graph for response time variation by request number for each server
for request_type in ['POST', 'GET']:
    plt.figure()
    for server, data in data_summary[request_type].items():
        plt.plot(data.index + 1, data['Response Time'], label=server)
    plt.xlabel('Resquest Number')
    plt.ylabel('Response Time (second)')
    plt.title(f'Response Time Variation by Request Number for {request_type} Requests')
    plt.legend()
    plt.savefig(os.path.join(output_dir, f'response_time_variation_{request_type}.pdf'))
    plt.close()

#plot throughput
for request_type in ['POST', 'GET']:
    plt.figure()
    throughputs = {server: data['Throughput'].mean() for server, data in data_summary[request_type].items()}
    plt.bar(throughputs.keys(), throughputs.values(), color=plot_colors[:len(throughputs)])
    plt.xlabel('Server')
    plt.ylabel('Throughput (requests/second) for each server')
    plt.title(f'Throughput for {request_type} Requests')
    plt.xticks(rotation=45)
    plt.savefig(os.path.join(output_dir, f'throughput_{request_type}.pdf'))
    plt.close()

pdf_doc = SimpleDocTemplate(os.path.join(output_dir, "results_tables.pdf"))
elements = []

print("Compiling data tables into PDF...")
for index, file in enumerate(result_files):
    print(f"Adding table for file {index + 1} of {total_files}: {file}")
    data = pd.read_csv(os.path.join(results_dir, file))
    if data.empty:
        print(f"Skipping empty data table for {file}")
        continue

    data.columns = ['Server', 'Type', 'Response Time', 'Status Code', 'Throughput', 'Duration']

    table_data = [data.columns.tolist()] + data.values.tolist()
    table = Table(table_data)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.black)
    ]))
    elements.append(table)
    elements.append(Spacer(1, 12))

pdf_doc.build(elements)
print("PDF document 'results_tables.pdf' has been created successfully.")

print("Done!")