#!/bin/bash
if [ $# -ne 1 ]; then
    echo "Usage: $0 <instance_number>"
    exit 1
fi

instance_number="$1"

#create a qemu instance for a VM
hda="sev-guest${instance_number}.qcow2"
cdrom="user-data${instance_number}.img"
if [ ! -f "$hda" ]; then
    cp sev-guest.qcow2 "$hda"
fi

#configure tap interface for each VM instance on host
ip tuntap add tapgh${instance_number} mode tap user $(whoami)
ip link set tapgh${instance_number} up
ip link set tapgh${instance_number} master br0

sudo ./launch-qemu.sh -hda "$hda" -cdrom user-data.img -default-network"${instance_number}" -sev-snp -smp 16 -mem 8192 # secure with sev-snp
# sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network -sev-es # secure but only encrypted state
# sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network  # start the vm without any protection
