# GeoNames city data

`geonames-cities.tsv` is a filtered extract from GeoNames `allCountries.zip`
(feature codes PPLC / PPLA / PPLA2, plus PPL with population ≥ 50,000).

- Source: https://download.geonames.org/export/dump/
- License: Creative Commons Attribution 4.0
- Used for multi-city autocomplete and city coordinate resolution (no API key).

Regenerate (requires `allCountries.zip`):

```bash
unzip -p ~/Downloads/allCountries.zip allCountries.txt \
  | awk -F'\t' 'BEGIN{OFS="\t"} $7=="P" && ($8=="PPLC" || $8=="PPLA" || $8=="PPLA2" || ($8=="PPL" && $15+0>=50000)) {print $1,$2,$3,$5,$6,$9,$11,$15,$8}' \
  > data/geonames-cities.tsv
```
