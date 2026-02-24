#!/bin/bash

CONFIG_FILE="/etc/login-alert.conf"
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
else
    echo "Configuration file $CONFIG_FILE not found. Exiting."
    exit 1
fi

TIMESTAMP_FILE="/var/lib/login-alert-last-check"

HOSTNAME=$(hostname)

exec 1> >(logger -t login-alert -p user.info)
exec 2> >(logger -t login-alert -p user.err)

[ ! -f "$TIMESTAMP_FILE" ] && date +%T > $TIMESTAMP_FILE && echo "Initialized timestamp file" && exit 0

START_TIME=$(cat "$TIMESTAMP_FILE")

NEW_LOGINS=$(ausearch -if /var/log/audit/audit.log --start $START_TIME -m USER_LOGIN | grep 'res=success')
if [ ! -z "$NEW_LOGINS" ]; then
    echo "Sending email to $EMAIL_TO"

    # Create the email file
    EMAIL_FILE=$(mktemp)
    cat > "$EMAIL_FILE" <<EOF
From: $EMAIL_FROM
To: $EMAIL_TO
Subject: [Alert] New SSH Login on $HOSTNAME

$NEW_LOGINS
EOF

    # Send email via curl using SMTP
    curl --url "smtp://$SMTP_SERVER:$SMTP_PORT" \
         --ssl \
         --mail-from "$EMAIL_FROM" \
         --mail-rcpt "$EMAIL_TO" \
         --upload-file "$EMAIL_FILE" \
         --user "$SMTP_USER:$SMTP_PASS" \
         --silent --show-error

    rm "$EMAIL_FILE"   # Clean up temp file
fi
date +%T > $TIMESTAMP_FILE
