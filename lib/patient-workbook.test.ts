// Run with: pnpm test  (Node >= 22.18, which runs TypeScript natively)
import { test } from "node:test"
import assert from "node:assert/strict"
import { posix } from "node:path"
import { strFromU8, unzipSync } from "fflate"
import {
  buildPatientWorkbook,
  columnLetter,
  escapeXml,
  excelDateSerial,
  INICIO,
  LISTA_RAPIDA,
  PACIENTES,
  patientWorkbookFileName,
  patientWorkbookParts,
  preparePatientWorkbook,
  SESIONES,
  type AppointmentRecord,
  type PatientRecord,
} from "./patient-workbook.ts"

const TODAY = "2026-10-06"

const patient = (
  id: string,
  fullName: string,
  extra: Partial<PatientRecord> = {},
): PatientRecord => ({
  id,
  fullName,
  email: null,
  phone: null,
  registeredOn: "2026-03-01",
  ...extra,
})

const visit = (
  id: string,
  clientId: string,
  date: string,
  extra: Partial<AppointmentRecord> = {},
): AppointmentRecord => ({
  id,
  clientId,
  date,
  startTime: "10:00:00",
  status: "confirmed",
  treatments: [],
  ...extra,
})

// The workbook's parts as { path: xml }, plus a reader for cell values
function workbook(
  patients: PatientRecord[] = [],
  appointments: AppointmentRecord[] = [],
) {
  const unzipped = unzipSync(
    buildPatientWorkbook({ patients, appointments, today: TODAY }),
  )
  const parts: Record<string, string> = {}
  for (const [path, data] of Object.entries(unzipped)) parts[path] = strFromU8(data)

  const unescape = (text: string) =>
    text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
  const strings = [
    ...parts["xl/sharedStrings.xml"].matchAll(/<si><t[^>]*>([^<]*)<\/t><\/si>/g),
  ].map((match) => unescape(match[1]))

  // Shared-string text or number shown in a cell; undefined when empty
  const cell = (sheet: number, ref: string): string | number | undefined => {
    const xml = parts[`xl/worksheets/sheet${sheet}.xml`]
    const match = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>(.*?)</c>)`).exec(xml)
    const value = match?.[2] && /<v>(.*?)<\/v>/.exec(match[2])?.[1]
    if (!match || value === undefined || value === "") return undefined
    return /t="s"/.test(match[1]) ? strings[Number(value)] : Number(value)
  }
  return { parts, strings, cell }
}

test("excelDateSerial counts days like Excel and rejects non-dates", () => {
  assert.equal(excelDateSerial("2026-10-06"), 46301)
  assert.equal(excelDateSerial("2000-01-01"), 36526)
  assert.equal(excelDateSerial("1900-03-01"), 61)
  assert.equal(excelDateSerial("2026-02-30"), null)
  assert.equal(excelDateSerial("2026-10-06T10:00:00Z"), null)
  assert.equal(excelDateSerial(""), null)
})

test("columnLetter names columns like Excel", () => {
  assert.deepEqual(
    [0, 25, 26, 47, 52, 701, 702].map(columnLetter),
    ["A", "Z", "AA", "AV", "BA", "ZZ", "AAA"],
  )
})

test("escapeXml escapes markup and drops what XML can't hold", () => {
  assert.equal(escapeXml('a & b <c> "d"'), "a &amp; b &lt;c&gt; &quot;d&quot;")
  assert.equal(escapeXml("a\u0000b\u0007c\uFFFEd"), "abcd")
  assert.equal(escapeXml("tab\tline\r\nend"), "tab\tline\nend")
  assert.equal(escapeXml("lone \uD800 surrogate 😀"), "lone  surrogate 😀")
  // Excel decodes _xHHHH_ as a character code, so a literal one is escaped
  assert.equal(escapeXml("_x0041_"), "_x005F_x0041_")
})

test("patients are listed once, A to Z in Spanish, with names as registered", () => {
  const { patients } = preparePatientWorkbook({
    patients: [
      patient("1", "zulema Vera"),
      patient("2", "Ñata Sosa"),
      patient("3", "  María   José  López "),
      patient("4", "Ángela Paz"),
      patient("5", "Nora Ríos"),
      patient("6", "Ana Núñez"),
      patient("2", "Ñata Sosa (duplicate row)"),
    ],
    appointments: [],
    today: TODAY,
  })
  assert.deepEqual(
    patients.map((p) => p.name),
    ["Ana Núñez", "Ángela Paz", "María José López", "Nora Ríos", "Ñata Sosa", "zulema Vera"],
  )
})

test("a client without a name is shown by email, then phone", () => {
  const { patients } = preparePatientWorkbook({
    patients: [
      patient("1", "", { email: "ana@gmail.com", phone: "11 1234-5678" }),
      patient("2", " ", { email: "", phone: " 11 9999-0000 " }),
      patient("3", ""),
    ],
    appointments: [],
    today: TODAY,
  })
  assert.deepEqual(patients, [
    { name: "(sin nombre)", openedOn: "2026-03-01", phone: "" },
    { name: "11 9999-0000", openedOn: "2026-03-01", phone: "11 9999-0000" },
    { name: "ana@gmail.com", openedOn: "2026-03-01", phone: "11 1234-5678" },
  ])
})

test("the file opens on the registration date, or an earlier appointment", () => {
  const { patients } = preparePatientWorkbook({
    patients: [
      patient("1", "Ana", { registeredOn: "2026-05-10" }),
      patient("2", "Bea", { registeredOn: "2026-05-10" }),
      patient("3", "Cata", { registeredOn: null }),
    ],
    appointments: [
      // recorded by the admin for a client added later
      visit("a", "1", "2026-04-02"),
      visit("b", "2", "2026-06-01"),
      visit("c", "2", "2026-01-15", { status: "cancelled" }),
    ],
    today: TODAY,
  })
  assert.deepEqual(
    patients.map((p) => p.openedOn),
    ["2026-04-02", "2026-05-10", null],
  )
})

test("sessions are the appointments that already happened, oldest first", () => {
  const { sessions } = preparePatientWorkbook({
    patients: [patient("1", "Ana López"), patient("2", "Bea Gómez")],
    appointments: [
      visit("past-confirmed", "1", "2026-09-01"),
      visit("past-completed", "2", "2026-08-20", { status: "completed" }),
      visit("cancelled", "1", "2026-07-01", { status: "cancelled" }),
      visit("today-confirmed", "1", TODAY),
      visit("today-completed", "2", TODAY, { status: "completed" }),
      visit("future-completed", "2", "2026-12-01", { status: "completed" }),
      visit("unknown-client", "admin", "2026-09-02"),
      visit("bad-date", "1", "2026-02-30"),
      visit("past-confirmed", "1", "2026-09-01"), // repeated by paging
    ],
    today: TODAY,
  })
  assert.deepEqual(
    sessions.map((s) => [s.date, s.name]),
    [
      ["2026-08-20", "Bea Gómez"],
      ["2026-09-01", "Ana López"],
      [TODAY, "Bea Gómez"],
    ],
  )
})

test("next session is the patient's next appointment on a later day", () => {
  const { sessions } = preparePatientWorkbook({
    patients: [patient("1", "Ana López")],
    appointments: [
      visit("1", "1", "2026-08-01"),
      visit("2", "1", "2026-08-01", { startTime: "15:00:00" }),
      visit("3", "1", "2026-08-20", { status: "cancelled" }),
      visit("4", "1", "2026-09-10", { status: "completed" }),
      visit("5", "1", "2026-11-03"), // booked, not a session yet
    ],
    today: TODAY,
  })
  assert.deepEqual(
    sessions.map((s) => [s.date, s.nextSession]),
    [
      ["2026-08-01", "2026-09-10"],
      ["2026-08-01", "2026-09-10"],
      ["2026-09-10", "2026-11-03"],
    ],
  )
})

test("each treatment is named once, alphabetically", () => {
  const { sessions } = preparePatientWorkbook({
    patients: [patient("1", "Ana López")],
    appointments: [
      visit("1", "1", "2026-08-01", {
        treatments: ["Peeling químico", " Dermaplaning ", "Peeling químico"],
      }),
    ],
    today: TODAY,
  })
  assert.equal(sessions[0].treatments, "Dermaplaning, Peeling químico")
})

test("the package is complete and every reference resolves", () => {
  const { parts } = workbook()
  const paths = Object.keys(parts)
  assert.equal(paths[0], "[Content_Types].xml")

  for (const [, part] of parts["[Content_Types].xml"].matchAll(/PartName="\/([^"]+)"/g)) {
    assert.ok(part in parts, `content type for missing part ${part}`)
  }
  for (const path of paths.slice(1)) {
    const typed =
      path.endsWith(".rels") ||
      parts["[Content_Types].xml"].includes(`PartName="/${path}"`)
    assert.ok(typed, `no content type for ${path}`)
  }
  for (const path of paths.filter((p) => p.endsWith(".rels"))) {
    const base = posix.dirname(posix.dirname(path))
    for (const [, target] of parts[path].matchAll(/Target="([^"]+)"/g)) {
      const resolved = posix.normalize(posix.join(base, target))
      assert.ok(resolved in parts, `${path} points to missing ${resolved}`)
    }
  }
})

test("the sheets, tables and dropdowns are the template's", () => {
  const { parts, cell } = workbook()
  assert.deepEqual(
    [...parts["xl/workbook.xml"].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]),
    ["INICIO", "PACIENTES", "SESIONES", "LISTA RÁPIDA"],
  )

  const tables = [
    { sheet: 2, spec: PACIENTES, ref: "A1:AV501" },
    { sheet: 3, spec: SESIONES, ref: "A1:H1001" },
    { sheet: 4, spec: LISTA_RAPIDA, ref: "A1:D501" },
  ]
  tables.forEach(({ sheet, spec, ref }, i) => {
    const table = parts[`xl/tables/table${i + 1}.xml`]
    assert.match(table, new RegExp(`name="${spec.table}" displayName="${spec.table}" ref="${ref}"`))
    assert.match(table, new RegExp(`<autoFilter ref="${ref}"/>`))
    assert.match(table, /TableStyleMedium2/)
    // Excel repairs the file if a header cell differs from its table column
    const columns = [...table.matchAll(/<tableColumn id="\d+" name="([^"]+)"/g)].map((m) => m[1])
    const headers = spec.columns.map((_, c) => cell(sheet, `${columnLetter(c)}1`))
    assert.deepEqual(columns, spec.columns.map((c) => escapeXml(c.header)))
    assert.deepEqual(headers, spec.columns.map((c) => c.header))
  })

  // Same 31 dropdowns as the template, one per column
  const dropdowns = [
    ...parts["xl/worksheets/sheet2.xml"].matchAll(
      /<dataValidation type="list" allowBlank="1" sqref="([A-Z]+)2:([A-Z]+)501"><formula1>"([^"]+)"<\/formula1>/g,
    ),
  ].map((m) => {
    assert.equal(m[1], m[2])
    return [m[1], m[3]]
  })
  assert.equal(dropdowns.length, 31)
  assert.match(
    parts["xl/worksheets/sheet2.xml"],
    /<dataValidations count="31"><dataValidation /,
  )
  const siNo = "K L M N O P Q R S U X Y Z AA AD AE AF AG AH AI AJ AK AL AM AN AO AP AQ AR"
  assert.deepEqual(
    dropdowns.filter(([, options]) => options === "Sí,No").map(([column]) => column),
    siNo.split(" "),
  )
  assert.deepEqual(
    dropdowns.filter(([, options]) => options !== "Sí,No"),
    [
      ["AB", "Normal,Seco,Graso,Mixto,Sensible,Deshidratado"],
      ["AC", "I,II,III,IV,V,VI"],
    ],
  )

  const inicio = parts["xl/worksheets/sheet1.xml"]
  assert.equal(inicio.match(/<mergeCell /g)?.length, 10)
  assert.equal(cell(1, "A1"), INICIO.title)
  assert.equal(cell(1, "A4"), INICIO.subtitle)
  assert.equal(cell(1, "A6"), INICIO.howTo)
  INICIO.steps.forEach((step, i) => assert.equal(cell(1, `A${7 + i}`), step))
})

test("patients and sessions fill their sheets", () => {
  const { cell } = workbook(
    [
      patient("1", "Bea Gómez", { phone: "1123456789", registeredOn: "2026-02-15" }),
      patient("2", "Ana López", { phone: "+54 9 11 5555-0000" }),
    ],
    [
      visit("a", "2", "2026-09-01", { treatments: ["Dermaplaning"] }),
      visit("b", "2", "2026-11-03"),
    ],
  )
  // PACIENTES: name, opening date (an Excel date), phone (always text)
  assert.equal(cell(2, "A2"), "Ana López")
  assert.equal(cell(2, "B2"), excelDateSerial("2026-03-01"))
  assert.equal(cell(2, "D2"), "+54 9 11 5555-0000")
  assert.equal(cell(2, "A3"), "Bea Gómez")
  assert.equal(cell(2, "B3"), excelDateSerial("2026-02-15"))
  assert.equal(cell(2, "D3"), "1123456789")
  assert.equal(cell(2, "A4"), undefined)
  // SESIONES
  assert.equal(cell(3, "A2"), excelDateSerial("2026-09-01"))
  assert.equal(cell(3, "B2"), "Ana López")
  assert.equal(cell(3, "C2"), "Dermaplaning")
  assert.equal(cell(3, "H2"), excelDateSerial("2026-11-03"))
  assert.equal(cell(3, "A3"), undefined)
  // LISTA RÁPIDA
  assert.deepEqual(
    ["A2", "B2", "A3", "B3"].map((ref) => cell(4, ref)),
    ["Ana López", "+54 9 11 5555-0000", "Bea Gómez", "1123456789"],
  )
})

test("tables keep formatted empty rows after the data", () => {
  const many = Array.from({ length: 600 }, (_, i) =>
    patient(String(i), `Paciente ${String(i).padStart(3, "0")}`),
  )
  const { parts, cell } = workbook(many)
  assert.match(parts["xl/tables/table1.xml"], /ref="A1:AV801"/)
  assert.match(parts["xl/tables/table3.xml"], /ref="A1:D801"/)
  assert.match(parts["xl/worksheets/sheet2.xml"], /sqref="K2:K801"/)
  assert.equal(cell(2, "A601"), "Paciente 599")
  assert.match(parts["xl/worksheets/sheet2.xml"], /<c r="B801" s="9"\/>/)
  assert.doesNotMatch(parts["xl/worksheets/sheet2.xml"], /r="A802"/)
})

test("cells, shared strings and styles are consistent", () => {
  const { parts } = workbook(
    [patient("1", "Ana <b>& Co</b> \u0007😀", { phone: "11 1234-5678" })],
    [visit("a", "1", "2026-09-01", { treatments: ["Hydrafacial"] })],
  )
  const sheets = Object.keys(parts).filter((p) => p.startsWith("xl/worksheets/sheet"))
  const all = sheets.map((p) => parts[p]).join("")
  const sst = parts["xl/sharedStrings.xml"]
  const items = sst.match(/<si>/g)?.length ?? 0
  assert.match(sst, new RegExp(`count="${all.match(/ t="s"/g)?.length}" uniqueCount="${items}"`))
  assert.match(sst, /<t>Ana &lt;b&gt;&amp; Co&lt;\/b&gt; 😀<\/t>/)

  const styles = Number(/<cellXfs count="(\d+)"/.exec(parts["xl/styles.xml"])?.[1])
  for (const [, style] of all.matchAll(/ s="(\d+)"/g)) assert.ok(Number(style) < styles)

  // Element order the SpreadsheetML schema requires (Excel repairs otherwise)
  const order = ["sheetFormatPr", "cols", "sheetData", "mergeCells", "dataValidations", "pageMargins", "ignoredErrors", "tableParts"]
  for (const path of sheets) {
    const positions = order
      .map((tag) => parts[path].indexOf(`<${tag}`))
      .filter((position) => position >= 0)
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), path)
  }
})

test("file name carries the date", () => {
  assert.equal(
    patientWorkbookFileName("2026-10-06"),
    "Fichero_Digital_Pacientes_Paula_Guerendiain_2026-10-06.xlsx",
  )
  const parts = patientWorkbookParts({ patients: [], sessions: [] })
  assert.deepEqual(
    Object.keys(workbook().parts),
    parts.map(([path]) => path),
  )
})
