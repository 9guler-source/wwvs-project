-- election_results: upsert(onConflict: 'election_id,option_id') 를 위한 unique constraint
ALTER TABLE election_results
  ADD CONSTRAINT election_results_election_id_option_id_key
  UNIQUE (election_id, option_id);
