-- Catalogar todas las plataformas posibles (consolas, PC y handhelds).
-- Los nombres coinciden con la plataforma primaria que devuelve RAWG
-- (parent_platforms) para que el mapeo automático resuelva sin caer en "Otra".
INSERT INTO "Platform" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
    -- Padres/categorías RAWG (parent_platforms)
    ('plat_mac', 'Apple Macintosh', 'apple-macintosh', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_linux', 'Linux', 'linux', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_android', 'Android', 'android', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ios', 'iOS', 'ios', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_web', 'Web', 'web', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_xbox', 'Xbox', 'xbox', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_sega', 'Sega', 'sega', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_atari', 'Atari', 'atari', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_amiga', 'Commodore Amiga', 'commodore-amiga', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Nintendo
    ('plat_nes', 'NES', 'nes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_snes', 'Super Nintendo', 'super-nintendo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_n64', 'Nintendo 64', 'nintendo-64', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_gamecube', 'GameCube', 'gamecube', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_wii', 'Wii', 'wii', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_wiiu', 'Wii U', 'wii-u', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_switch', 'Nintendo Switch', 'nintendo-switch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_gb', 'Game Boy', 'game-boy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_gbc', 'Game Boy Color', 'game-boy-color', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_gba', 'Game Boy Advance', 'game-boy-advance', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ds', 'Nintendo DS', 'nintendo-ds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_3ds', 'Nintendo 3DS', 'nintendo-3ds', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_vboy', 'Virtual Boy', 'virtual-boy', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- PlayStation
    ('plat_ps1', 'PlayStation 1', 'playstation-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ps2', 'PlayStation 2', 'playstation-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ps3', 'PlayStation 3', 'playstation-3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ps4', 'PlayStation 4', 'playstation-4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ps5', 'PlayStation 5', 'playstation-5', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_psp', 'PSP', 'psp', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_vita', 'PS Vita', 'ps-vita', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Xbox
    ('plat_x360', 'Xbox 360', 'xbox-360', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_xone', 'Xbox One', 'xbox-one', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_xsx', 'Xbox Series X|S', 'xbox-series-x-s', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Sega
    ('plat_genesis', 'Sega Genesis', 'sega-genesis', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_megadrive', 'Mega Drive', 'mega-drive', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_saturn', 'Sega Saturn', 'sega-saturn', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_dc', 'Sega Dreamcast', 'sega-dreamcast', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_gg', 'Sega Game Gear', 'sega-game-gear', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_sms', 'Sega Master System', 'sega-master-system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Atari
    ('plat_a2600', 'Atari 2600', 'atari-2600', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_a7800', 'Atari 7800', 'atari-7800', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_lynx', 'Atari Lynx', 'atari-lynx', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_jaguar', 'Atari Jaguar', 'atari-jaguar', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

    -- Otras
    ('plat_neogeo', 'Neo Geo', 'neo-geo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ngpc', 'Neo Geo Pocket', 'neo-geo-pocket', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_pcengine', 'PC Engine', 'pc-engine', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_tg16', 'TurboGrafx-16', 'turbografx-16', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_3do', '3DO', '3do', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_c64', 'Commodore 64', 'commodore-64', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_msx', 'MSX', 'msx', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_ws', 'WonderSwan', 'wonderswan', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_steamdeck', 'Steam Deck', 'steam-deck', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_intellivision', 'Intellivision', 'intellivision', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('plat_coleco', 'ColecoVision', 'colecovision', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;