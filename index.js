import { PluginMeta, PluginEvent, CacheExtension } from '@posthog/plugin-scaffold'
import type { RequestInfo, RequestInit, Response } from 'node-fetch'
import { createBuffer } from '@posthog/plugin-contrib'
import { RetryError } from '@posthog/plugin-scaffold'

// fetch only declared, as it's provided as a plugin VM global
declare function fetch(url: RequestInfo, init?: RequestInit): Promise<Response>
	
//function insert at
function addStr(str, index, stringToAdd){
  return str.substring(0, index) + stringToAdd + str.substring(index, str.length);
}

//Specify metrics : 'total_requests' => sum of all http requests (events), 'errors' : sum of error responses (API). 
export const metrics = {
    'total_requests': 'sum',
    'errors': 'sum'
}

//PluginMeta contains the object cache, and can also include global, attachments, and config.
interface SendEventsPluginMeta extends PluginMeta {
    
    //Cache: to store values that persist across special function calls. 
    //The values are stored in Redis, an in-memory store.
    cache: CacheExtension,
    
    //gives access to the app config values as described in 'plugin.json' 
    //and configured via the PostHog interface.
    config: {
        eventsToInclude: string
	RequestURL: string
	MethodType: string
    },
    
    //global object is used for sharing functionality between setupPlugin 
    //and the rest of the special functions/
    global: {
        eventsToInclude: Set<string>
        buffer: ReturnType<typeof createBuffer>
    }
}

//verifyConfig function is used to verify that the included events are inserted, otherwise it will throw an error.
function verifyConfig({ config }: SendEventsPluginMeta) {
    if (!config.eventsToInclude) {
        throw new Error('No events to include!')
    }
}

async function sendFeedbackToGorse(event: PluginEvent, meta: SendEventsPluginMeta) {

    const { config, metrics } = meta

    //split included events by ','
    const types = (config.eventsToInclude).split(',')

    //Condition: if the recieved event name is not like the included one, 
    if (types.includes(event.event)) {

        //increment the number of requests
        metrics.total_requests.increment(1)
        
	//data
	const url = config.RequestURL
	const method_type = config.MethodType
	const feedback = new String('[{\"Comment\": \"\",  \"FeedbackType\": \"' + event.event + '\",  \"ItemId\": \"' + event.properties?.item_id + '\",  \"Timestamp\": \"' + event.timestamp + '\",  \"UserId\": \"' + event.distinct_id + '\"}]')
	
	//fetch : add feedback
        await fetch(
                    url,
                    {
                        method: method_type,
                        headers: {
			    'User-Agent': '*',
                            'accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                    body: feedback,
                    }
                ).then(async (response) => JSON.stringify(response.json()))
				//Then with the data from the response in JSON...
				.then((data) => {
					console.log('Success: feedback inserted')
				})
				//Then with the error genereted...
				.catch((error) => {
				  console.error('Error',response.status,':', error)
				})
    } else {
        
        return
        
    }
}
	
//onEvent function takes an event and an object of type PluginMeta as parameters to read an event but not to modify it.
export async function onEvent(event, meta) {
	
   await sendFeedbackToGorse(event, meta)

}
	

//teardownPlugin is ran when a app VM is destroyed, It can be used to flush/complete any operations that may still be pending.
export function teardownPlugin({ global }: SendEventsPluginMeta) {
    global.buffer.flush()
}
