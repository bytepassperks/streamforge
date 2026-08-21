-- Videos created before the orange identity kept the old blue default accent in
-- their stored player config, so their title plate and play button still render
-- blue. Only the untouched legacy default is rewritten; a chosen colour stays.
update videos
set player_config = replace(player_config, '"accent":"#4f7cff"', '"accent":"#ff6106"')
where player_config like '%"accent":"#4f7cff"%';

update videos
set player_config = replace(player_config, '"accent": "#4f7cff"', '"accent": "#ff6106"')
where player_config like '%"accent": "#4f7cff"%';
