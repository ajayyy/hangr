(ns ^{:author "Daniel Leong"
      :doc "Conversation utilities"}
  hangr.util.conversation
  (:require [hangr.util :refer [id->key join-sorted-by]]))

(defn event-incoming?
  "Given the user's (:self) id and an event,
  return true if that event is incoming"
  [self-id event]
  (and (not= self-id
             (-> event :sender))
       (not (:client-generated-id event))))

(defn conv-event-incoming?
  "Given a conversation and an event in that
  conversation, return true if that event is incoming"
  [conv event]
  (let [self-id (-> conv :self :id)]
    (event-incoming? self-id event)))

(defn conv-latest-read
  "Get a usable latest-read timestamp for a participant
  in a conversation"
  [conv person-id]
  (let [given (->> conv 
                   :conversation 
                   :read_state
                   (filter #(= person-id
                               (id->key (:participant_id %))))
                   first
                   :last_read_timestamp)]
    (when (number? given)
      (if (> given 0)
        ; easy case; we actually know
        given
        ; timestamp = 0 means "unchanged"; find the most recent event where they're the sender
        (or (->> conv 
                 :events
                 (filter #(= person-id
                             (:sender %)))
                 last
                 :timestamp)
            ; fall back to 0 if it was just nil
            0)))))

(defn fill-members
  "Given a conv and a map of id -> person `people`,
  fill out the :members array to include as much
  info about each member as possible"
  [people conv]
  (update 
    conv
    :members
    (partial
      map
      (fn [member]
        (let [person-id (:id member)
              person (get people person-id)]
          (assoc
            (if (:name person) ; don't override with worse info
              person
              member)
            ; also, insert their latest-read-timestamp
            :latest-read-timestamp
            (conv-latest-read
              conv
              person-id)))))))

(defn insert-read-indicators
  "Given a conv whose :members array has been updated
  via (fill-members), inserts special events into :events
  to indicate each member's last-read state"
  [conv]
  (let [self-id (-> conv :self :id)
        members (->> (:members conv)
                     (remove (comp (partial = self-id) :id))
                     (sort-by :latest-read-timestamp))
        member-read-events (map 
                             (fn [member]
                               {:sender (:id member)
                                :hangr-type :read-indicator
                                :id (str (name (:id member)) "-read")
                                :timestamp (:latest-read-timestamp member)})
                             members)]
    (update-in 
      conv
      [:events]
      (partial join-sorted-by :timestamp)
      member-read-events)))

(defn unread?
  "Check if the conversation is unread"
  [conv]
  (when-let [latest-read (-> conv :self :latest-read-timestamp)]
    (->> conv
         :events
         ; only incoming events matter
         (filter (partial conv-event-incoming? conv))
         ; hangout events don't count
         (remove :hangout_event)
         ; find any whose timestamp is after our latest read
         (some #(> (:timestamp %) latest-read)))))
