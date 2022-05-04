import { PluginMeta, PluginEvent, CacheExtension } from '@posthog/plugin-scaffold'
import type { RequestInfo, RequestInit, Response } from 'node-fetch'
import { createBuffer } from '@posthog/plugin-contrib'
import { RetryError } from '@posthog/plugin-scaffold'

// fetch only declared, as it's provided as a plugin VM global
declare function fetch(url: RequestInfo, init?: RequestInit): Promise<Response>

export const metrics = {
    'total_requests': 'sum',
    'errors': 'sum'
}

interface SendEventsPluginMeta extends PluginMeta {
    cache: CacheExtension,
    config: {
        eventsToInclude: string
    },
    global: {
        eventsToInclude: Set<string>
        buffer: ReturnType<typeof createBuffer>
    }
}
    
function verifyConfig({ config }: SendEventsPluginMeta) {
    if (!config.eventsToInclude) {
        throw new Error('No events to include!')
    }
}

async function sendEventToGorse(event: PluginEvent, meta: SendEventsPluginMeta) {

    const { config, metrics } = meta

    const types = (config.eventsToInclude || '').split(',')

    if (!types.includes(event.event) || !event.properties) {
        return
    }

    const token = await getToken(meta)

    metrics.total_requests.increment(1)
    const response = await fetch(
        `http://51.89.15.39:8087/api/feedback`,
        {
            method: POST,
            headers: { 'accept: application/json', 'Content-Type': 'application/json'},
            body: { 'Comment': '',
                    'FeedbackType' : JSON.stringify(event.event),
                    'ItemId' : JSON.stringify(event.properties.service_id),
                    'Timestamp' : JSON.stringify(event.timestamp),
                    'UserId' :  JSON.stringify(event.properties.anonymousId),
                    
        }
    )
    if (!statusOk(response)) {
        metrics.errors.increment(1)
        throw new Error(`Not a 200 response from event hook ${response.status}. Response: ${response}`)
    }
}

export async function setupPlugin(meta: SendEventsPluginMeta) {
    verifyConfig(meta)
    const { global } = meta
    global.buffer = createBuffer({
        limit: 1024 * 1024, // 1 MB
        timeoutSeconds: 1,
        onFlush: async (events) => {
            for (const event of events) {
                await sendEventToGorse(event, meta)
            }
        },
    })
}

export async function onEvent(event: PluginEvent, { global }: SendEventsPluginMeta) {
    const eventSize = JSON.stringify(event).length
    global.buffer.add(event, eventSize)
}

export function teardownPlugin({ global }: SendEventsPluginMeta) {
    global.buffer.flush()
}

function statusOk(res: Response) {
    return String(res.status)[0] === '2'
}
