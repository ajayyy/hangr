(ns ^{:author "Daniel Leong"
      :doc "util"}
  hangr.util
  (:require [re-frame.core :refer [dispatch]]))

(defn js->real-clj
  "Convenience"
  [js]
  (-> js
      (js->clj :keywordize-keys true)))

(defn id->key
  "Takes a {:chat_id C :gaia_id G} and makes a single keyword"
  [map-id]
  (keyword (str (:chat_id map-id)
                "|"
                (:gaia_id map-id))))

(defn key->id
  "Takes a keyword id and returns the original {:chat_id C :gaia_id G}"
  [map-id]
  (-> map-id
      name
      (clojure.string/split "|")
      (as-> vals
        (zipmap [:chat_id :gaia_id]
                vals))))

(defn click-dispatch
  "Returns an on-click handler that dispatches the given event
  and prevents the default on-click events"
  [event]
  (fn [e]
    (.preventDefault e)
    (dispatch event)))

(defn join-sorted-by
  "Join sorted sequences by interleaving elements from both
  using the given sort-key"
  [sort-key coll1 coll2 & colls]
  (->> (apply concat coll1 coll2 colls)
       (sort-by sort-key)))
