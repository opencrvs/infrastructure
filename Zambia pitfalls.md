# Zambia pitfalls

## Internet connectivity test

Bootstrap script has internet connectivity test:
ping ....

This doesn't work on secured environments with specific firewall setup

## Group

❌ FAIL: GID 1000 exists as group 'laxton-zm-ssh', not 'provision'.
❌ FAIL: UID 1000 exists as user 'laxton-zm-ssh', not 'provision'.

Id changed to 1100


## Open Questions

What would be public domain for OpenCRVS?

## Disk space

Hello Charles,

While Kubernetes deployment I faced issue with server disk layout.
Root disk partition has only 29G storage, which is insufficient in most cases to run OpenCRVS containers. Is it possible to increase the root partition?

vmudryi@zm-opencrvs:~$ df -h
Filesystem      Size  Used Avail Use% Mounted on
/dev/root        29G   15G   15G  49% /
tmpfs            16G     0   16G   0% /dev/shm
tmpfs           6.3G  3.3M  6.3G   1% /run
tmpfs           5.0M     0  5.0M   0% /run/lock
/dev/sda15      105M  6.2M   99M   6% /boot/efi
/dev/sdb1        63G   28K   60G   1% /mnt
/dev/sdc        492G   42G  425G   9% /data
tmpfs           3.2G   12K  3.2G   1% /run/user/1101

sudo systemctl stop kubelet
sudo systemctl stop containerd

sudo pkill -TERM containerd-shim || true
sleep 5
sudo pkill -KILL containerd-shim || true

sudo rsync -aHAX --numeric-ids /var/lib/containerd/ /data/containerd/

sudo mv /var/lib/containerd /var/lib/containerd.bak
sudo ln -s /data/containerd /var/lib/containerd

sudo systemctl start containerd
sudo systemctl start kubelet