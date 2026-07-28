import * as nodemailer from 'nodemailer';
function createSmtpConnectionUrl(connection) {
    const protocol = connection.secureMode === 'tls' ? 'smtps:' : 'smtp:';
    const connectionUrl = new URL(`${protocol}//localhost`);
    connectionUrl.hostname = connection.host;
    connectionUrl.port = String(connection.port);
    connectionUrl.username = connection.username;
    connectionUrl.password = connection.password;
    connectionUrl.searchParams.set('connectionTimeout', '10000');
    connectionUrl.searchParams.set('greetingTimeout', '10000');
    connectionUrl.searchParams.set('socketTimeout', '15000');
    connectionUrl.searchParams.set('tls.minVersion', 'TLSv1.2');
    connectionUrl.searchParams.set('tls.rejectUnauthorized', 'true');
    if (connection.secureMode === 'starttls') {
        connectionUrl.searchParams.set('requireTLS', 'true');
    }
    if (connection.secureMode === 'plain') {
        connectionUrl.searchParams.set('ignoreTLS', 'true');
    }
    return connectionUrl.toString();
}
export function createCompanyMailTransport() {
    return Object.freeze({
        async sendTestEmail(connection, message) {
            const transporter = nodemailer.createTransport(createSmtpConnectionUrl(connection));
            try {
                await transporter.verify();
                await transporter.sendMail({
                    from: {
                        address: message.senderEmail,
                        name: message.senderName,
                    },
                    to: message.recipientEmail,
                    ...(message.replyToEmail !== null
                        ? {
                            replyTo: message.replyToEmail,
                        }
                        : {}),
                    subject: message.subject,
                    text: message.text,
                });
            }
            finally {
                transporter.close();
            }
        },
    });
}
//# sourceMappingURL=company-mail.transport.js.map