-- Keep shared-grade foreign-key checks indexed as more clubs connect seasons.
create index playhq_grade_mappings_grade on club_selection_private.playhq_grade_mappings(grade_id);
