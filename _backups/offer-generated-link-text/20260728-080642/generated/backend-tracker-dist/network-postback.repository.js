function normalizeSafeInteger(value, columnName) {
    const normalizedValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(normalizedValue)) {
        throw new Error(`The database returned an invalid ${columnName} value.`);
    }
    return normalizedValue;
}
function normalizeTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('The database returned an invalid postback timestamp.');
    }
    return date.toISOString();
}
function parseStatus(value) {
    switch (value) {
        case 'pending':
        case 'approved':
        case 'rejected':
        case 'reversed':
            return value;
        default:
            throw new Error('The database returned an unsupported conversion status.');
    }
}
function parsePayoutMode(value) {
    if (value === 'fixed_member' || value === 'per_offer') {
        return value;
    }
    throw new Error('The database returned an unsupported payout mode.');
}
function mapRow(row) {
    return Object.freeze({
        conversionId: row.conversion_id,
        publicConversionId: row.public_conversion_id,
        status: parseStatus(row.conversion_status),
        payoutMode: parsePayoutMode(row.payout_mode),
        payoutAmountMinor: normalizeSafeInteger(row.payout_amount_minor, 'payout_amount_minor'),
        payoutCurrency: row.payout_currency,
        wasIdempotent: row.was_idempotent,
        processedAt: normalizeTimestamp(row.processed_at),
    });
}
export function createNetworkPostbackRepository(database) {
    return Object.freeze({
        async ingestPostback(input) {
            const result = await database.query({
                name: 'network-postback-ingest',
                text: `
          select
            conversion_id,
            public_conversion_id,
            conversion_status,
            payout_mode,
            payout_amount_minor,
            payout_currency,
            was_idempotent,
            processed_at
          from public.ingest_public_network_postback(
            $1,
            $2,
            $3,
            $4,
            $5::public.conversion_status,
            $6,
            $7,
            $8::jsonb
          )
          limit 1
        `,
                values: [
                    input.endpointKeyHash,
                    input.publicClickId,
                    input.externalConversionId,
                    input.idempotencyKey,
                    input.status,
                    input.revenueAmountMinor,
                    input.revenueCurrency,
                    JSON.stringify(input.payload),
                ],
            });
            const row = result.rows[0];
            return row === undefined ? undefined : mapRow(row);
        },
    });
}
//# sourceMappingURL=network-postback.repository.js.map