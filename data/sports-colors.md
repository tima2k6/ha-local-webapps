# Sports color helpers

Created in Home Assistant on 2026-10-09. Search **Sports** under Settings > Devices & services > Helpers.

Each helper stores comma-separated RGB channels and can be edited in HA. Values restore across restarts. Hex codes below are a reference; helpers store RGB. Sounders, Reign and Torrent RGB values come from solid fills in their current official logo files, rather than a published numeric brand guide.

## Use in an automation or script

Use **Sports - Apply color** (`script.sports_apply_color`) to apply both color and brightness from a helper. Select the color helper and target lights in the script UI, or call it in YAML:

```yaml
action: script.sports_apply_color
data:
  color_helper: input_text.sports_supersonics_green
  light_entities:
    - light.living_room
```

The script reads the helper each time and sets `rgb_color` plus `brightness` equal to the largest RGB channel (0-255). This applies the color's HSV value as bulb brightness: SuperSonics green uses 101/255, about 40%; Kraken Ice Blue uses 217/255, about 85%. `0,0,0` turns the target lights off. Invalid or unavailable helper values stop the script before any light changes.

Bulb brightness is not calibrated screen luminance; this is an approximation, and bulb gamut and room conditions can still affect the visual match. Black, silver and metallic finishes cannot be reproduced as material finishes by a light.

Script source: `sports-apply-color-script.json`. Installed through HA's script configuration API; it is editable under Settings > Automations & scenes > Scripts.

## Seattle Team Colors rotation

Start **Seattle Team Colors** (`script.seattle_team_colors`) from Settings > Automations & scenes > Scripts, a dashboard script button, or an automation. Each Living Room lamp cycles through a different offset in the same 32-color palette from Seahawks, Mariners, Kraken, Sounders, Storm, Reign, Torrent, SuperSonics and UW. Repeated white helpers appear once. Gonzaga, WSU and Georgia are not part of this Seattle-only rotation.

Default pace: 20-second fade followed by a 10-second hold for each color; a full loop takes 16 minutes. Colors progress around the hue wheel, with neutral whites/grays grouped together. The five lamps start evenly spaced through the palette and advance together; each lamp completes the full palette every loop. Unavailable lamps are skipped. Brightness uses each helper's strongest RGB channel, limited to 10-35% for soft room lighting. Fade time, hold time and the brightness limit are adjustable script fields. The optional Starting color field selects the first color on TV Color and holds the first frame for at least one minute; the other lamps stay staggered, then the usual timing resumes. Color helper edits are read on the next visit to that color. Missing or invalid helper values are skipped.

```yaml
action: script.turn_on
target:
  entity_id: script.seattle_team_colors
```

To stop, run **Seattle Team Colors - Stop** (`script.seattle_team_colors_stop`), or turn off the running rotation script. The current fade can finish; lamps stay on. Turning the entire Living Room off stops the rotation at the end of the current step. Applying a single color with `script.sports_apply_color` also stops the rotation before setting the requested color.

Script source files: `seattle-team-colors-script.json` and `seattle-team-colors-stop-script.json`. All scripts are editable in HA. The rotation runs while HA is online and ends on a restart or script reload; it does not automatically resume.

## Colors

| Helper | Hex | RGB |
| --- | --- | --- |
| `input_text.sports_seahawks_college_navy` | `#002244` | `0,34,68` |
| `input_text.sports_seahawks_action_green` | `#69BE28` | `105,190,40` |
| `input_text.sports_seahawks_wolf_grey` | `#A5ACAF` | `165,172,175` |
| `input_text.sports_seahawks_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_mariners_navy_blue` | `#0C2C56` | `12,44,86` |
| `input_text.sports_mariners_northwest_green` | `#005C5C` | `0,92,92` |
| `input_text.sports_mariners_silver` | `#C4CED4` | `196,206,212` |
| `input_text.sports_mariners_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_kraken_deep_sea_blue` | `#001628` | `0,22,40` |
| `input_text.sports_kraken_ice_blue` | `#99D9D9` | `153,217,217` |
| `input_text.sports_kraken_boundless_blue` | `#355464` | `53,84,100` |
| `input_text.sports_kraken_shadow_blue` | `#68A2B9` | `104,162,185` |
| `input_text.sports_kraken_red_alert` | `#E9072B` | `233,7,43` |
| `input_text.sports_kraken_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_sounders_rave_green` | `#4FB84F` | `79,184,79` |
| `input_text.sports_sounders_pacific_blue` | `#0033A1` | `0,51,161` |
| `input_text.sports_sounders_heritage_aqua` | `#78DED4` | `120,222,212` |
| `input_text.sports_sounders_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_storm_storm_green` | `#2C5235` | `44,82,53` |
| `input_text.sports_storm_lightning_yellow` | `#FEE11A` | `254,225,26` |
| `input_text.sports_storm_bolt_green` | `#78BE20` | `120,190,32` |
| `input_text.sports_storm_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_reign_blackened_blue` | `#1E1A25` | `30,26,37` |
| `input_text.sports_reign_reign_blue` | `#243067` | `36,48,103` |
| `input_text.sports_reign_gold` | `#9A7648` | `154,118,72` |
| `input_text.sports_reign_summit_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_torrent_slate_green` | `#0A5458` | `10,84,88` |
| `input_text.sports_torrent_shadow_blue` | `#6AA2B8` | `106,162,184` |
| `input_text.sports_torrent_glacier_blue` | `#8CB7C9` | `140,183,201` |
| `input_text.sports_torrent_foam` | `#E8E6D7` | `232,230,215` |
| `input_text.sports_torrent_haze_grey` | `#BBBBBB` | `187,187,187` |
| `input_text.sports_gonzaga_athletic_blue` | `#041E42` | `4,30,66` |
| `input_text.sports_gonzaga_athletic_red` | `#C8102E` | `200,16,46` |
| `input_text.sports_gonzaga_athletic_gray` | `#C1C6C8` | `193,198,200` |
| `input_text.sports_gonzaga_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_supersonics_green` | `#00653A` | `0,101,58` |
| `input_text.sports_supersonics_yellow` | `#FFC200` | `255,194,0` |
| `input_text.sports_supersonics_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_uw_purple` | `#33006F` | `51,0,111` |
| `input_text.sports_uw_gold` | `#E8D3A2` | `232,211,162` |
| `input_text.sports_uw_metallic_gold` | `#917B4C` | `145,123,76` |
| `input_text.sports_uw_gray` | `#D8D9DA` | `216,217,218` |
| `input_text.sports_uw_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_wsu_cougar_crimson` | `#981E32` | `152,30,50` |
| `input_text.sports_wsu_dark_steel_grey` | `#53565A` | `83,86,90` |
| `input_text.sports_wsu_white` | `#FFFFFF` | `255,255,255` |

| `input_text.sports_georgia_bulldog_red` | `#BA0C2F` | `186,12,47` |
| `input_text.sports_georgia_black` | `#2C2A29` | `44,42,41` |
| `input_text.sports_georgia_white` | `#FFFFFF` | `255,255,255` |
| `input_text.sports_georgia_grey` | `#A2AAAD` | `162,170,173` |

## Sources

- [Seahawks](https://teamcolorcodes.com/seattle-seahawks-color-codes/): Published digital palette; RGB derived from hex.
- [Mariners](https://usteamcolors.com/seattle-mariners-team-colors/): Published digital palette; RGB derived from hex.
- [Kraken](https://colorcodeguide.com/official/seattle-kraken): Published digital palette; RGB derived from hex.
- [Sounders](https://images.mlssoccer.com/image/upload/v1702319240/assets/sea/logos/SEA2023-Full_Color-480x480_fk6mpu.png): RGB sampled from solid fills in current official logo.
- [Storm](https://bestcolorcodes.com/seattle-storm-colors/): Published digital palette; RGB derived from hex.
- [Reign](https://images.squarespace-cdn.com/content/v1/65823d9021b93e044e237270/5001384e-e1ec-43a8-adf5-b1cb25229ae0/SRFC-primary.png?format=1500w): RGB sampled from solid fills in current official logo.
- [Torrent](https://res.cloudinary.com/pwhl-low/image/upload/v1762305836/SEA-t-11.4.25-logo-RGB-Lock-up-Primary_qhe8r8.png): RGB sampled from solid fills in current official logo.
- [Gonzaga](https://www.gonzaga.edu/-/media/Website/Documents/About/Offices-and-Services/Marcom/Brand-Trademark/Trademark/AthleticLogoGuide-FINAL.ashx?hash=E983398C0E85206A02E6D992E3D76D68516A2A0F&la=en): Published digital palette; RGB derived from hex.
- [SuperSonics](https://teamcolorcodes.com/seattle-supersonics-colors/): Published historical final-era palette; RGB derived from hex.
- [UW](https://gohuskies.com/documents/download/2024/8/19/2024-UWATHBrandGuide.pdf): Official athletics guide; RGB derived from listed hex or RGB.
- [WSU](https://static.wsucougars.com/old_site/pdf/genrel/wsu-brand-manual_single.pdf): Official athletics guide; RGB derived from listed hex or RGB.

- [Georgia Bulldogs](https://georgiadogs.com/documents/download/2026/3/16/GG_BrandManual_online26.pdf): 2026 athletics guide primary red/black and secondary white/grey.

UW and WSU use their athletics palettes. Their general university brand palettes have different purple/gold and crimson/gray values. SuperSonics uses the final-era green/yellow palette.

To create missing helpers again, run `node tools/sync-sports-color-helpers.cjs`. The script preserves existing helper values.
