(ns ^{:author "Daniel Leong"
      :doc "Notification"}
  hangr.util.notification
  (:require [hangr.util :refer [js->real-clj id->key safe-require
                                read-package-json]]))

(defonce notifier (safe-require "node-notifier"))
(defonce package-json (read-package-json))
(defonce bundle-id (.-bundleId package-json))

(defn notify!
  "Raise a native notification. Takes an options map
  and, optionally, a callback that's called when the
  user provides a text reply to the notification (macOS only)."
  [& {:keys [title message icon reply? timeout wait?
             close-label actions
             on-reply on-click]
      :or {timeout 20}}] ;; so terminal-notifier doesn't linger if ignored
  {:pre [(string? title)
         (string? message)]}
  (let [params
        (->> {:title title
              :message message 
              :icon icon
              :reply reply?
              :wait wait?
              :timeout timeout
              :closeLabel close-label
              :actions actions
              :sender bundle-id}
             (filter second)
             (into {})
             clj->js)]
    (js/console.log "NOTIFY!" params)
    (js/console.log "bundle-id:" bundle-id, "notifier:" notifier)
    (-> notifier
        (.notify 
          params
          (fn [e resp & [reply]]
            (js/console.log "notify:" resp)
            (let [reply (js->real-clj reply)]
              (cond
                ;; did they reply inline?
                (and on-reply (:activationValue reply)) 
                (on-reply (:activationValue reply))
                ;; nope; did they tap to open the notif?
                (and (= "activate" resp)
                     on-click)
                (on-click)
                ;; else, ignored...
                :else 
                nil))))))) 

(defn conv-msg->title
  "Pick a 'Title' for the `msg` received in the
  `conv` appropriate for use in a notification"
  [conv msg & {:keys [fallback]
               :or {fallback "New Hangouts Message"}}]
  (let [sender-id (id->key (:sender_id msg))
        sender (->> conv
                    :members
                    sender-id)]
    (if-let [sender-name (:name sender)]
      sender-name
      fallback)))

(defn msg->notif
  "Extract text from a `msg` to be used in a notification"
  [msg]
  (or
    (when-let [text-parts 
               (->> msg
                    :chat_message
                    :message_content
                    :segment
                    (filter #(let [seg-type (:type %)]
                               (or (= "TEXT" seg-type)
                                   (= "LINK" seg-type))))
                    (map :text)
                    seq)]
      (clojure.string/join " " text-parts))
    ;
    (when-let [img-parts 
               (->> msg
                    :chat_message
                    :message_content
                    :attachment
                    seq)]
      "Sent you an image")
    ;
    (when-let [hangout-event (-> msg :hangout_event :event_type)]
      (case hangout-event
        "START_HANGOUT" "Call Started"
        "END_HANGOUT" "Call Ended"
        nil))
    ;
    (do
      ; NB: js/console gives us nicer inspection
      (js/console.log "Can't create text preview for" (clj->js msg))
      ; just return a blank string for safety
      "")))
