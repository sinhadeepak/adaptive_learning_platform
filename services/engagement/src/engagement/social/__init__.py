"""F8a — Friend system + presence aggregation.

The friendships table is the canonical record. Online presence is not
stored here — alp-battle writes a Redis heartbeat per active WS
connection, and `/social/friends/online` joins this table against the
heartbeat set at read time.

Schema rule: rows always store (user_a_id, user_b_id) with
user_a_id < user_b_id. Helper functions normalise inputs so callers
don't have to think about ordering.
"""
