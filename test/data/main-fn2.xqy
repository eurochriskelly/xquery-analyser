xquery version "1.0-ml";

(:NB voor deze test wordt onder de gebruiker opera-download een besluit verwerkt, eigenlijk zou dat onder de
  gebruiker opera-opera moeten gebeuren :)

(: zorg ervoor dat de content database en schema database voor dit project leeg zijn :)
import module namespace dphf = "http://koop.overheid.nl/opera/opera/test-suite/lib/delivery-plan-helper-functions" at "/test/suites/opera/opera/test-suite/lib/delivery-plan-helper-functions.xqy";
import module namespace dl-zip = "http://koop.overheid.nl/opera/download/lib/zip" at "/opera/download/lib/zip.xqy";

declare option xdmp:mapping "false";

dphf:clear-opera-data(),
dphf:clear-opera-frbr-data(),
for $uri in cts:uri-match(fn:concat($dl-zip:zip-prefix, "*"))
return xdmp:document-delete($uri);

(: laden bestanden initieel besluit :)
import module namespace test="http://koop.overheid.nl/lvbb/test-cds-helper" at "/test/test-cds-helper.xqy";

let $locatie := "besluiten/v1.2.0/feature-type-style/"
let $files := (
  "opdracht.xml","publicatie.xml","manifest.xml","manifest-ow.xml",
  "gio-1.xml","gio-1.gml","owLocaties.xml","owRegelingsgebied.xml","owRegeltekst.xml"
)
let $prefix := "id-fts/"
for $file in $files
return test:load-test-file(fn:concat($locatie, $file), xdmp:database(), test:build-content-uri(fn:concat($prefix, $file)));

(: Collecties toekennen zoals deze ook door de regisseur worden toegekend :)
import module namespace test="http://koop.overheid.nl/lvbb/test-cds-helper" at "/test/test-cds-helper.xqy";
import module namespace collecties = "http://koop.overheid.nl/opera/opera/lib/collecties" at "/opera/opera/lib/collecties.xqy";

let $files := (
  "opdracht.xml","publicatie.xml","manifest.xml","manifest-ow.xml",
  "gio-1.xml","gio-1.gml","owLocaties.xml","owRegelingsgebied.xml","owRegeltekst.xml"
)
let $id := "id-fts"
let $oin := "00000001003214345000"
let $collections := collecties:get-collections-regisseur-opdrachtbestanden($oin, $id)
for $file in $files 
let $uri := test:build-content-uri(fn:concat($id, "/", $file))
return xdmp:document-add-collections($uri, $collections);

(: snel verwerken besluit zonder de validaties te doen - alleen de opslaan stappen :)
import module namespace dphf = "http://koop.overheid.nl/opera/opera/test-suite/lib/delivery-plan-helper-functions" at "/test/suites/opera/opera/test-suite/lib/delivery-plan-helper-functions.xqy";
import module namespace pl = "http://koop.overheid.nl/opera/opera/test-suite/lib/process-lib" at "/test/suites/opera/opera/test-suite/lib/process-lib.xqy";

let $params := map:map()
=>map:with("id-levering", "id-fts")
=>map:with("oin", "00000001003214345000")
=>map:with("mode", "unittest")
=>map:with("prefix", "id-fts/")
=>map:with("opdracht-naam", "opdracht.xml")

let $step-map := dphf:execute-delivery-plan("97",$params)
return pl:check-results($step-map);

(: publicatiedatum toevoegen aan besluit zoals pup dat zou doen :)
import module namespace xpo = "http://koop.overheid.nl/opera/opera/lib/xpo" at "/opera/opera/lib/xpo.xqy";
import module namespace queries = "http://koop.overheid.nl/opera/opera/lib/queries" at "/opera/opera/lib/queries.xqy";

let $id := "id-fts"
let $oin := "00000001003214345000"

let $uri-besluit := cts:uris((),(),queries:query-besluit($oin,$id))
let $timestamp := "2021-07-01T00:00:00"
return xpo:toevoegen-publicatie-datum-aan-document($uri-besluit, $timestamp, fn:false());

(: identifiers van cio toevoegen :)
import module namespace test="http://koop.overheid.nl/lvbb/test-cds-helper" at "/test/test-cds-helper.xqy";
import module namespace publicatie = "http://koop.overheid.nl/opera/opera/lib/api/publicatie" at "/opera/opera/lib/api/publicatie.xqy";
import module namespace antwoorden = "http://koop.overheid.nl/opera/opera/lib/antwoorden" at "/opera/opera/lib/antwoorden.xqy";
import module namespace constants = "http://koop.overheid.nl/opera/download/test-suite/lib/constants" at "../lib/constants.xqy";

let $id := "id-fts"
let $oin := "00000001003214345000"
let $identifier-info :=
<OpslaanIdentifiersRequest>
  <InformatieObjecten>
    <InformatieObject>
      <DcId>dc-2021-3456_1</DcId>
    </InformatieObject>
  </InformatieObjecten>
  <RegelingVersies>
    <RegelingVersie type="nieuw">
      <CvdrId>CVDR22345_1</CvdrId>
    </RegelingVersie>
  </RegelingVersies>
  <Cios>
    <Cio type="nieuw">
      <Id>CIO234567_1</Id>
      <DcId>dc-2021-11855_1</DcId>
    </Cio>
  </Cios>
  { $constants:master-configuraties }
</OpslaanIdentifiersRequest>
let $input := document{$identifier-info}
let $_ := xdmp:invoke-function(
  function() {
    publicatie:opslaan-identifiers($oin,$id,$input)
  },
  map:map()
  =>map:with("update", "true")
)
return ();

(: bestaande zip-files en status files verwijderen :)
import module namespace dl-zip = "http://koop.overheid.nl/opera/download/lib/zip" at "/opera/download/lib/zip.xqy";

for $uri in cts:uri-match((fn:concat($dl-zip:zip-prefix, "*"),"*/status/*.xml"))
return xdmp:document-delete($uri);

(: aanmaken van de download zip file cio :)
import module namespace test="http://koop.overheid.nl/lvbb/test-cds-helper" at "/test/test-cds-helper.xqy";
import module namespace antwoorden = "http://koop.overheid.nl/opera/opera/lib/antwoorden" at "/opera/opera/lib/antwoorden.xqy";
import module namespace dl-zip = "http://koop.overheid.nl/opera/download/lib/zip" at "/opera/download/lib/zip.xqy";

let $frbr-work := "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1"
let $request-id := sem:uuid-string()

let $antwoord-download-ok := xdmp:invoke-function(function() { dl-zip:maak-download-package($frbr-work, $request-id) })
let $result := antwoorden:get-output-goed-antwoord($antwoord-download-ok)
let $zip-uri := $result[1]
let $node-name-zip-uri := xs:string(fn:node-name($zip-uri))
let $elapsed-time := $result[2]
let $node-name-elapsed-time := xs:string(fn:node-name($elapsed-time))
return (
  test:assert-true(antwoorden:check-goed-antwoord($antwoord-download-ok), fn:concat("Antwoord download ok bij download cio-1 is niet gelijk aan het verwachte goede antwoord ", xdmp:quote($antwoord-download-ok))),
  test:assert-true($node-name-zip-uri = "zip-uri", fn:concat("node-name bij download cio-1 is geen zip-uri maar is ", $node-name-zip-uri)),
  test:assert-true(fn:not(fn:empty($zip-uri)), "zip-uri bij antwoord download ok bij download cio-1 is leeg"),
  test:assert-true($node-name-elapsed-time = "elapsed-time", fn:concat("node-name bij download cio-1 is geen elapsed-time maar is ", $node-name-elapsed-time)),
  test:assert-true(fn:not(fn:empty($elapsed-time)), "elapsed-time bij antwoord download ok bij download cio-1 is leeg")
);

(: testen aangemaakte zip-file :)
import module namespace test="http://koop.overheid.nl/lvbb/test-cds-helper" at "/test/test-cds-helper.xqy";
import module namespace dl-zip = "http://koop.overheid.nl/opera/download/lib/zip" at "/opera/download/lib/zip.xqy";
import module namespace dl-util = "http://koop.overheid.nl/opera/download/lib/download-utils" at "/opera/download/lib/download-utils.xqy";

declare namespace zip = "xdmp:zip";
declare namespace pakbon = "https://standaarden.overheid.nl/stop/imop/uitwisseling/";
declare variable $expected-ns := "https://standaarden.overheid.nl/stop/imop/geo/";

let $frbr-expression-expected := "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1/nld@2023-06-02;1"

let $zip-uri := cts:uri-match(fn:concat($dl-zip:zip-prefix, "*"))
let $zip-content := fn:doc($zip-uri)
let $zip-manifest := xdmp:zip-manifest($zip-content)
let $pakbon := xdmp:zip-get($zip-content, $dl-util:pakbon-filenaam)/element()
let $local-name := fn:local-name($pakbon)
let $frbr-expression := $pakbon/pakbon:Component/pakbon:FRBRExpression/fn:string()
let $aantal-files-in-zip := fn:count($zip-manifest//zip:part)
let $files-in-zip := $zip-manifest//zip:part/fn:string()
let $expected-map := map:map()
=>map:with("pakbon.xml",
  map:map()
  =>map:with("schemaversie", map:map()
    =>map:with("xpath", "/pakbon:Pakbon/@schemaversie")
    =>map:with("value", "1.3.0")
  )
  =>map:with("FRBRWork", map:map()
    =>map:with("xpath", "//pakbon:FRBRWork")
    =>map:with("value", "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1")
  )
  =>map:with("FRBRExpression", map:map()
    =>map:with("xpath", "//pakbon:FRBRExpression")
    =>map:with("value", "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1/nld@2023-06-02;1")
  )
)
=>map:with("IO-14439405200589617771/Identificatie.xml",
  map:map()
  =>map:with("schemaversie", map:map()
    =>map:with("xpath", "/data:ExpressionIdentificatie/@schemaversie")
    =>map:with("value", "1.3.0")
  )
  =>map:with("FRBRWork", map:map()
    =>map:with("xpath", "//data:FRBRWork")
    =>map:with("value", "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1")
  )
  =>map:with("FRBRExpression", map:map()
    =>map:with("xpath", "//data:FRBRExpression")
    =>map:with("value", "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1/nld@2023-06-02;1")
  )
  =>map:with("soortWork", map:map()
    =>map:with("xpath", "//data:soortWork")
    =>map:with("value", "/join/id/stop/work_010")
  )
)
=>map:with("IO-14439405200589617771/VersieMetadata.xml",
  map:map()
  =>map:with("schemaversie", map:map()
    =>map:with("xpath", "/data:InformatieObjectVersieMetadata/@schemaversie")
    =>map:with("value", "1.3.0")
  )
  =>map:with("heeftGeboorteregeling", map:map()
    =>map:with("xpath", "//data:heeftGeboorteregeling")
    =>map:with("value", "/akn/nl/act/gm9920/2023/R_2023060216_0115812")
  )
  =>map:with("bestandsnaam", map:map()
    =>map:with("xpath", "//data:heeftBestanden/data:heeftBestand/data:Bestand/data:bestandsnaam")
    =>map:with("value", "gio-1.gml")
  )
  =>map:with("hash", map:map()
    =>map:with("xpath", "//data:heeftBestanden/data:heeftBestand/data:Bestand/data:hash")
    =>map:with("value", "")
  )
)
=>map:with("IO-14439405200589617771/Metadata.xml",
  map:map()
  =>map:with("schemaversie", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/@schemaversie")
    =>map:with("value", "1.3.0")
  )
  =>map:with("eindverantwoordelijke", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:eindverantwoordelijke")
    =>map:with("value", "/tooi/id/gemeente/gm9920")
  )
  =>map:with("maker", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:maker")
    =>map:with("value", "/tooi/id/gemeente/gm9920")
  )
  =>map:with("alternatieveTitel", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:alternatieveTitels/data:alternatieveTitel")
    =>map:with("value", "alternatieve-titel IO gio-1")
  )
  =>map:with("naamInformatieObject", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:naamInformatieObject")
    =>map:with("value", "naam IO gio-1")
  )
  =>map:with("officieleTitel", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:officieleTitel")
    =>map:with("value", "/join/id/regdata/gm9920/2023/IO_2023060216_0115812_1-gio-1")
  )
  =>map:with("publicatieinstructie", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:publicatieinstructie")
    =>map:with("value", "TeConsolideren")
  )
  =>map:with("formaatInformatieobject", map:map()
    =>map:with("xpath", "/data:InformatieObjectMetadata/data:formaatInformatieobject")
    =>map:with("value", "/join/id/stop/informatieobject/gio_002")
  )
)
=>map:with("IO-14439405200589617771/FeatureTypeStyle.xml", map:map()
  =>map:with("locatie", map:map()
    =>map:with("xpath", "/se:FeatureTypeStyle/se:FeatureTypeName")
    =>map:with("value", "geo:Locatie")
  )
  =>map:with("naam", map:map()
    =>map:with("xpath", "/se:FeatureTypeStyle/se:Rule/se:Name")
    =>map:with("value", "naam IO gio-1")
  )
)
=>map:with("IO-14439405200589617771/Momentopname.xml", map:map()
  =>map:with("schemaversie", map:map()
    =>map:with("xpath", "/data:Momentopname/@schemaversie")
    =>map:with("value", "1.3.0")
  )
  =>map:with("doel", map:map()
    =>map:with("xpath", "/data:Momentopname/data:doel")
    =>map:with("value", "/join/id/proces/gm9920/2023/D_2023060216_0115812_1")
  )
)
let $namespaces := map:map()
=>map:with("pakbon", "https://standaarden.overheid.nl/stop/imop/uitwisseling/")
=>map:with("data", "https://standaarden.overheid.nl/stop/imop/data/")
=>map:with("gio", "https://standaarden.overheid.nl/stop/imop/gio/")
=>map:with("se", "http://www.opengis.net/se")

return (
  test:assert-true($local-name = "Pakbon", fn:concat("local-name bij download cio-1 is geen Pakbon maar is ", $local-name)),
  test:assert-true($frbr-expression = $frbr-expression-expected,
    fn:concat("frbr-expression bij download cio-1 is geen ", $frbr-expression-expected," maar is ", $frbr-expression)),
  test:assert-true($aantal-files-in-zip eq 7, fn:concat("aantal files bij download cio-1 in zip is geen 8 maar ", $aantal-files-in-zip)),
  test:assert-true("IO-14439405200589617771/FeatureTypeStyle.xml" = $files-in-zip,
    fn:concat("zip-manifest bevat geen IO-14439405200589617771/FeatureTypeStyle.xml ::", fn:string-join($files-in-zip,","))),
  test:assert-true("IO-14439405200589617771/Momentopname.xml" = $files-in-zip,
    fn:concat("zip-manifest bevat geen IO-14439405200589617771/Momentopname.xml ::", fn:string-join($files-in-zip,","))),
  for $part in $zip-manifest//zip:part/fn:string()
  let $node := xdmp:zip-get($zip-content, $part)
  let $expected := map:get($expected-map, $part)
  where fn:not($node/node() instance of binary())
  return (
    for $key in map:keys($expected)
    let $xpath := map:get(map:get($expected, $key), "xpath")
    let $expected-value := map:get(map:get($expected, $key), "value")
    let $actual := xdmp:unpath($xpath, $namespaces, $node)/fn:string()
    return (
      test:assert-true(fn:count($actual) eq fn:count($expected-value), "Aantal verwachte waarden ongelijk aan aantal actuele waarden"),
      if (fn:count($actual) eq fn:count($expected-value) and fn:count($actual) gt 1)
      then 
        for $val in $actual
        return test:assert-true($val = $expected-value,
          fn:concat("actuele waarde ", $val, " komt niet voor in verwachte waarden ", fn:string-join($expected-value,",")))
      else test:assert-true($actual eq $expected-value,
        fn:concat("Actueel waarde bij download cio voor veld ", $key, " (", $actual, ") ongelijk aan verwachte waarde ", $expected-value))
    )
  ),
  let $IO-FeatureTypeStyle := xdmp:zip-get($zip-content, "IO-14439405200589617771/FeatureTypeStyle.xml")
  return (
    for $element in $IO-FeatureTypeStyle//*[ local-name(.) = 'FeatureTypeName' or local-name(.) ='SemanticTypeIdentifier']
    let $value-prefix := fn:substring-before($element/text(),':')
    let $actual-ns := fn:namespace-uri-for-prefix($value-prefix, $element)
    return test:assert-true( $actual-ns = $expected-ns,
      fn:concat("Geen correcte namespace declaratie voor prefix '", $value-prefix, "' in waarde van element ", fn:local-name($element),
      ", expected = '", $expected-ns, "', actual = '", $actual-ns, "'"
      )
    )
  )
);

