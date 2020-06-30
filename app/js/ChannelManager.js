// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const logger = require('logger-sharelatex')
const metrics = require('metrics-sharelatex')
const settings = require('settings-sharelatex')

const ClientMap = new Map() // for each redis client, store a Map of subscribed channels (channelname -> subscribe promise)

// Manage redis pubsub subscriptions for individual projects and docs, ensuring
// that we never subscribe to a channel multiple times. The socket.io side is
// handled by RoomManager.

module.exports = {
  getClientMapEntry(rclient) {
    // return the per-client channel map if it exists, otherwise create and
    // return an empty map for the client.
    return (
      ClientMap.get(rclient) || ClientMap.set(rclient, new Map()).get(rclient)
    )
  },

  subscribe(rclient, baseChannel, id) {
    const clientChannelMap = this.getClientMapEntry(rclient)
    const channel = `${baseChannel}:${id}`
    const actualSubscribe = function () {
      // subscribe is happening in the foreground and it should reject
      const p = rclient.subscribe(channel)
      p.finally(function () {
        if (clientChannelMap.get(channel) === subscribePromise) {
          return clientChannelMap.delete(channel)
        }
      })
        .then(function () {
          logger.log({ channel }, 'subscribed to channel')
          return metrics.inc(`subscribe.${baseChannel}`)
        })
        .catch(function (err) {
          logger.error({ channel, err }, 'failed to subscribe to channel')
          return metrics.inc(`subscribe.failed.${baseChannel}`)
        })
      return p
    }

    const pendingActions = clientChannelMap.get(channel) || Promise.resolve()
    var subscribePromise = pendingActions.then(actualSubscribe, actualSubscribe)
    clientChannelMap.set(channel, subscribePromise)
    logger.log({ channel }, 'planned to subscribe to channel')
    return subscribePromise
  },

  unsubscribe(rclient, baseChannel, id) {
    const clientChannelMap = this.getClientMapEntry(rclient)
    const channel = `${baseChannel}:${id}`
    const actualUnsubscribe = function () {
      // unsubscribe is happening in the background, it should not reject
      const p = rclient
        .unsubscribe(channel)
        .finally(function () {
          if (clientChannelMap.get(channel) === unsubscribePromise) {
            return clientChannelMap.delete(channel)
          }
        })
        .then(function () {
          logger.log({ channel }, 'unsubscribed from channel')
          return metrics.inc(`unsubscribe.${baseChannel}`)
        })
        .catch(function (err) {
          logger.error({ channel, err }, 'unsubscribed from channel')
          return metrics.inc(`unsubscribe.failed.${baseChannel}`)
        })
      return p
    }

    const pendingActions = clientChannelMap.get(channel) || Promise.resolve()
    var unsubscribePromise = pendingActions.then(
      actualUnsubscribe,
      actualUnsubscribe
    )
    clientChannelMap.set(channel, unsubscribePromise)
    logger.log({ channel }, 'planned to unsubscribe from channel')
    return unsubscribePromise
  },

  publish(rclient, baseChannel, id, data) {
    let channel
    metrics.summary(`redis.publish.${baseChannel}`, data.length)
    if (id === 'all' || !settings.publishOnIndividualChannels) {
      channel = baseChannel
    } else {
      channel = `${baseChannel}:${id}`
    }
    // we publish on a different client to the subscribe, so we can't
    // check for the channel existing here
    return rclient.publish(channel, data)
  }
}
