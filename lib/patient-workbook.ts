// Paula's "Fichero Digital de Pacientes": the Excel workbook she keeps her
// patient files in (sheets INICIO, PACIENTES, SESIONES and LISTA RÁPIDA),
// rebuilt from her template and filled with the clients and the appointment
// history in the system. Every other column stays empty for her to complete,
// with the template's dropdowns and date formats in place.
// Pure module without local imports, so `pnpm test` runs it as is.

import { strToU8, zipSync } from "fflate"

// ---------------------------------------------------------------------------
// Input and prepared rows
// ---------------------------------------------------------------------------

export interface PatientRecord {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  // Argentina date (yyyy-mm-dd) the client was registered in the system
  registeredOn: string | null
}

export interface AppointmentRecord {
  id: string
  clientId: string
  date: string // yyyy-mm-dd
  startTime: string // HH:MM[:SS]
  status: string // confirmed | cancelled | completed
  treatments: string[]
}

export interface PatientWorkbookInput {
  patients: PatientRecord[]
  appointments: AppointmentRecord[]
  today: string // yyyy-mm-dd, in Argentina
}

export interface PatientRow {
  name: string
  openedOn: string | null
  phone: string
}

export interface SessionRow {
  date: string
  name: string
  treatments: string
  nextSession: string | null
}

export interface PatientWorkbookData {
  patients: PatientRow[]
  sessions: SessionRow[]
}

const collator = new Intl.Collator("es", { sensitivity: "base" })

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Spanish alphabetical order (ignores accents and case, ñ after n); exact
// ties are broken so the order never depends on how the rows arrived.
function compareNames(a: string, b: string): number {
  return collator.compare(a, b) || compareText(a, b)
}

function cleanText(text: string | null): string {
  return (text ?? "").normalize("NFC").replace(/\s+/g, " ").trim()
}

// The name as registered; a client without one is shown by email or phone
// so the row can still be told apart.
function displayName(patient: PatientRecord): string {
  return (
    cleanText(patient.fullName) ||
    cleanText(patient.email) ||
    cleanText(patient.phone) ||
    "(sin nombre)"
  )
}

function earliestDate(...dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter(
    (date): date is string => !!date && excelDateSerial(date) !== null,
  )
  return valid.length ? valid.reduce((a, b) => (b < a ? b : a)) : null
}

export function preparePatientWorkbook({
  patients,
  appointments,
  today,
}: PatientWorkbookInput): PatientWorkbookData {
  const names = new Map<string, string>()
  const uniquePatients: PatientRecord[] = []
  for (const patient of patients) {
    if (names.has(patient.id)) continue
    names.set(patient.id, displayName(patient))
    uniquePatients.push(patient)
  }
  const nameOf = (id: string) => names.get(id) ?? ""

  // Appointments that took place or are still booked, oldest first
  const seen = new Set<string>()
  const visits = appointments
    .filter((appointment) => {
      if (seen.has(appointment.id)) return false
      seen.add(appointment.id)
      return (
        (appointment.status === "confirmed" ||
          appointment.status === "completed") &&
        names.has(appointment.clientId) &&
        excelDateSerial(appointment.date) !== null
      )
    })
    .sort(
      (a, b) =>
        compareText(a.date, b.date) ||
        compareText(a.startTime, b.startTime) ||
        compareNames(nameOf(a.clientId), nameOf(b.clientId)) ||
        compareText(a.id, b.id),
    )

  const visitsByPatient = new Map<string, AppointmentRecord[]>()
  for (const visit of visits) {
    const list = visitsByPatient.get(visit.clientId) ?? []
    list.push(visit)
    visitsByPatient.set(visit.clientId, list)
  }

  const patientRows = uniquePatients
    .sort(
      (a, b) =>
        compareNames(nameOf(a.id), nameOf(b.id)) || compareText(a.id, b.id),
    )
    .map((patient) => ({
      name: nameOf(patient.id),
      // When the file was opened: registration, or an earlier appointment the
      // admin recorded for a client added later
      openedOn: earliestDate(
        patient.registeredOn,
        visitsByPatient.get(patient.id)?.[0]?.date,
      ),
      phone: cleanText(patient.phone),
    }))

  const sessions: SessionRow[] = []
  for (const visit of visits) {
    // Only what already happened: appointments of earlier days (nothing marks
    // them completed automatically, so most stay confirmed), and today's
    // once they are marked completed
    const happened =
      visit.date < today ||
      (visit.date === today && visit.status === "completed")
    if (!happened) continue
    const next = visitsByPatient
      .get(visit.clientId)
      ?.find((other) => other.date > visit.date)
    sessions.push({
      date: visit.date,
      name: nameOf(visit.clientId),
      treatments: [...new Set(visit.treatments.map(cleanText).filter(Boolean))]
        .sort(compareNames)
        .join(", "),
      nextSession: next?.date ?? null,
    })
  }

  return { patients: patientRows, sessions }
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

interface Column {
  header: string
  width: number
  date?: boolean
  // Dropdown values, as Excel lists them
  options?: string
  // Phone numbers: digits-only text is not flagged as "number stored as text"
  textNumbers?: boolean
}

interface TableSheet {
  name: string
  table: string
  columns: Column[]
  headerStyle: number
  textStyle: number // 0: empty text cells are left out
  dateStyle: number
  // The template comes with this many formatted empty rows, and the export
  // always leaves at least spareRows after the data, so there is room to keep
  // adding rows with the dropdowns and date formats.
  minRows: number
  spareRows: number
}

// Indexes into cellXfs in STYLES_XML
const STYLE = {
  title: 1,
  subtitle: 2,
  section: 3,
  instruction: 4,
  pacientesHeader: 5,
  sesionesHeader: 6,
  listaHeader: 7,
  text: 8,
  dateWrapped: 9,
  date: 10,
} as const

const SI_NO = "Sí,No"

export const PACIENTES: TableSheet = {
  name: "PACIENTES",
  table: "PacientesTable",
  headerStyle: STYLE.pacientesHeader,
  textStyle: STYLE.text,
  dateStyle: STYLE.dateWrapped,
  minRows: 500,
  spareRows: 200,
  columns: [
    { header: "Apellido y nombre", width: 24 },
    { header: "Fecha apertura", width: 13, date: true },
    { header: "Domicilio", width: 24 },
    { header: "Teléfono", width: 15, textNumbers: true },
    { header: "Fecha nacimiento", width: 13, date: true },
    { header: "Edad", width: 13 },
    { header: "Ocupación", width: 18 },
    { header: "Medicación actual", width: 28 },
    { header: "Alergias conocidas", width: 28 },
    { header: "Antecedentes médicos / cirugías", width: 28 },
    { header: "Embarazo", width: 14, options: SI_NO },
    { header: "Lactancia", width: 14, options: SI_NO },
    { header: "Diabetes", width: 14, options: SI_NO },
    { header: "Alteración tiroidea", width: 14, options: SI_NO },
    { header: "Anticoagulantes", width: 14, options: SI_NO },
    { header: "Rosácea", width: 14, options: SI_NO },
    { header: "Herpes", width: 14, options: SI_NO },
    { header: "Dermatitis", width: 14, options: SI_NO },
    { header: "Patología autoinmune", width: 14, options: SI_NO },
    { header: "Otra condición", width: 14 },
    { header: "Control dermatológico", width: 17, options: SI_NO },
    { header: "Fecha / profesional dermatología", width: 28 },
    { header: "Productos y activos skincare", width: 28 },
    { header: "Protector solar diario", width: 16, options: SI_NO },
    { header: "Uso de retinoides", width: 16, options: SI_NO },
    { header: "Ácidos / exfoliantes", width: 16, options: SI_NO },
    { header: "Tratamiento médico", width: 16, options: SI_NO },
    {
      header: "Biotipo",
      width: 15,
      options: "Normal,Seco,Graso,Mixto,Sensible,Deshidratado",
    },
    { header: "Fototipo", width: 15, options: "I,II,III,IV,V,VI" },
    { header: "Barrera alterada", width: 14, options: SI_NO },
    { header: "Eritema", width: 14, options: SI_NO },
    { header: "Descamación", width: 14, options: SI_NO },
    { header: "Oleosidad", width: 14, options: SI_NO },
    { header: "Tirantez", width: 14, options: SI_NO },
    { header: "Comedones", width: 14, options: SI_NO },
    { header: "Pápulas", width: 14, options: SI_NO },
    { header: "Pústulas", width: 14, options: SI_NO },
    { header: "Milium", width: 14, options: SI_NO },
    { header: "Manchas", width: 14, options: SI_NO },
    { header: "Telangiectasias", width: 14, options: SI_NO },
    { header: "Cicatrices", width: 14, options: SI_NO },
    { header: "Arrugas", width: 14, options: SI_NO },
    { header: "Flacidez", width: 14, options: SI_NO },
    { header: "Rosácea (lesión)", width: 14, options: SI_NO },
    { header: "Localización / descripción", width: 30 },
    { header: "Objetivo principal", width: 30 },
    { header: "Tratamiento sugerido / cuidados domiciliarios", width: 30 },
    { header: "Observaciones generales", width: 30 },
  ],
}

export const SESIONES: TableSheet = {
  name: "SESIONES",
  table: "SesionesTable",
  headerStyle: STYLE.sesionesHeader,
  textStyle: STYLE.text,
  dateStyle: STYLE.dateWrapped,
  minRows: 1000,
  spareRows: 500,
  columns: [
    { header: "Fecha", width: 13, date: true },
    { header: "Apellido y nombre", width: 24 },
    { header: "Tratamiento realizado", width: 28 },
    { header: "Productos / activos", width: 28 },
    { header: "Aparatología", width: 28 },
    { header: "Observaciones / evolución", width: 28 },
    { header: "Cuidados domiciliarios indicados", width: 28 },
    { header: "Próxima sesión", width: 13, date: true },
  ],
}

export const LISTA_RAPIDA: TableSheet = {
  name: "LISTA RÁPIDA",
  table: "ListaRapidaTable",
  headerStyle: STYLE.listaHeader,
  textStyle: 0,
  dateStyle: STYLE.date,
  minRows: 500,
  spareRows: 200,
  columns: [
    { header: "Apellido y nombre", width: 28 },
    { header: "Teléfono", width: 18, textNumbers: true },
    { header: "Fecha nacimiento", width: 16, date: true },
    { header: "Observación breve", width: 35 },
  ],
}

export const INICIO = {
  name: "INICIO",
  title: "FICHERO DIGITAL DE PACIENTES",
  subtitle: "PAULA GUERENDIAIN · ESTÉTICA INTEGRAL",
  howTo: "CÓMO USARLO — MUY SIMPLE",
  steps: [
    "1. En la pestaña PACIENTES cargás una sola vez los datos y la anamnesis de cada persona.",
    "2. Cada paciente ocupa UNA FILA. No hace falta crear una hoja por persona.",
    "3. Para buscar a alguien: usá la flechita del encabezado “Apellido y nombre” o Buscar (⌘F en Mac).",
    "4. Para verlos por abecedario: en la flechita de “Apellido y nombre”, elegí ordenar A → Z.",
    "5. Cada vez que una paciente vuelve, registrás la sesión en la pestaña SESIONES.",
    "6. Las celdas con opciones tienen desplegables para que no tengas que escribir todo.",
    "7. Guardá siempre una copia de seguridad del archivo.",
  ],
}

// One row of a sheet, by header; the other columns stay empty
function sheetRow(
  sheet: TableSheet,
  values: Record<string, string | null>,
): (string | null)[] {
  for (const header of Object.keys(values)) {
    if (!sheet.columns.some((column) => column.header === header)) {
      throw new Error(`${sheet.name} has no column "${header}"`)
    }
  }
  return sheet.columns.map((column) => values[column.header] ?? null)
}

// ---------------------------------------------------------------------------
// SpreadsheetML
// ---------------------------------------------------------------------------

// 0 -> "A", 25 -> "Z", 26 -> "AA"
export function columnLetter(index: number): string {
  let letters = ""
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return letters
}

// Excel stores a date as the number of days since 1899-12-30 (valid from
// 1900-03-01 on); null for anything that isn't a real yyyy-mm-dd date.
export function excelDateSerial(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const time = Date.UTC(year, month - 1, day)
  const parsed = new Date(time)
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  const serial = (time - Date.UTC(1899, 11, 30)) / 86400000
  return serial >= 61 ? serial : null
}

// Text for XML: drops what XML 1.0 can't hold (control characters, lone
// surrogates), turns CRLF into LF, escapes markup and keeps a literal
// "_xHHHH_" as typed (Excel would decode it as a character code).
export function escapeXml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (match) =>
      match.length === 2 ? match : "",
    )
    .replace(/_x[0-9A-Fa-f]{4}_/g, "_x005F$&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const MAX_CELL_TEXT = 32767

interface StringTable {
  add(text: string): number
  xml(): string
}

// Text cells point into one shared list of strings (what Excel itself
// writes); phone numbers stay text and never turn into numbers.
function createStringTable(): StringTable {
  const index = new Map<string, number>()
  const strings: string[] = []
  let references = 0
  return {
    add(text) {
      references++
      const value = text.slice(0, MAX_CELL_TEXT)
      let position = index.get(value)
      if (position === undefined) {
        position = strings.length
        index.set(value, position)
        strings.push(value)
      }
      return position
    },
    xml() {
      const items = strings.map((text) => {
        const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : ""
        return `<si><t${space}>${escapeXml(text)}</t></si>`
      })
      return (
        XML_HEADER +
        `<sst xmlns="${MAIN_NS}" count="${references}" uniqueCount="${strings.length}">` +
        items.join("") +
        "</sst>"
      )
    },
  }
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const SPREADSHEETML = "application/vnd.openxmlformats-officedocument.spreadsheetml"

const PAGE_MARGINS =
  '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'

function styleAttribute(style: number): string {
  return style ? ` s="${style}"` : ""
}

// Empty text keeps only the cell's format (or nothing, if it has none)
function textCell(
  ref: string,
  style: number,
  text: string,
  strings: StringTable,
): string {
  if (!text) return style ? `<c r="${ref}"${styleAttribute(style)}/>` : ""
  return `<c r="${ref}"${styleAttribute(style)} t="s"><v>${strings.add(text)}</v></c>`
}

function dateCell(ref: string, style: number, date: string): string {
  const serial = excelDateSerial(date)
  if (serial === null) {
    return style ? `<c r="${ref}"${styleAttribute(style)}/>` : ""
  }
  return `<c r="${ref}"${styleAttribute(style)}><v>${serial}</v></c>`
}

function rowXml(row: number, cells: string, height?: number): string {
  const attributes = height ? ` ht="${height}" customHeight="1"` : ""
  return cells
    ? `<row r="${row}"${attributes}>${cells}</row>`
    : `<row r="${row}"${attributes}/>`
}

// Children in the order the SpreadsheetML schema requires
function worksheetXml(parts: {
  cols: string
  rows: string[]
  mergeCells?: string[]
  dataValidations?: string[]
  ignoredErrors?: string
  hasTable?: boolean
}): string {
  const merges = parts.mergeCells ?? []
  const validations = parts.dataValidations ?? []
  return (
    XML_HEADER +
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${parts.cols}</cols>` +
    `<sheetData>${parts.rows.join("")}</sheetData>` +
    (merges.length
      ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
      : "") +
    (validations.length
      ? `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`
      : "") +
    PAGE_MARGINS +
    (parts.ignoredErrors ?? "") +
    (parts.hasTable ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : "") +
    "</worksheet>"
  )
}

function inicioSheetXml(strings: StringTable): string {
  // Each block spans A:H, and every cell of the block carries its format
  const block = (row: number, style: number, text = "") =>
    Array.from({ length: 8 }, (_, i) =>
      textCell(`${columnLetter(i)}${row}`, style, i === 0 ? text : "", strings),
    ).join("")
  const rows = [
    rowXml(1, block(1, STYLE.title, INICIO.title), 24),
    rowXml(2, block(2, STYLE.title), 24),
    rowXml(3, "", 24),
    rowXml(4, block(4, STYLE.subtitle, INICIO.subtitle), 24),
    rowXml(5, "", 24),
    rowXml(6, block(6, STYLE.section, INICIO.howTo), 24),
    ...INICIO.steps.map((step, i) =>
      rowXml(7 + i, block(7 + i, STYLE.instruction, step), 34),
    ),
  ]
  return worksheetXml({
    cols: Array.from(
      { length: 8 },
      (_, i) => `<col min="${i + 1}" max="${i + 1}" width="16" customWidth="1"/>`,
    ).join(""),
    rows,
    mergeCells: [
      "A1:H2",
      "A4:H4",
      "A6:H6",
      ...INICIO.steps.map((_, i) => `A${7 + i}:H${7 + i}`),
    ],
  })
}

function tableSheetXml(
  sheet: TableSheet,
  rows: (string | null)[][],
  strings: StringTable,
  tableId: number,
): { sheetXml: string; tableXml: string } {
  const lastRow = 1 + Math.max(sheet.minRows, rows.length + sheet.spareRows)
  const ref = `A1:${columnLetter(sheet.columns.length - 1)}${lastRow}`
  const bodyRange = (i: number) =>
    `${columnLetter(i)}2:${columnLetter(i)}${lastRow}`

  const xmlRows = [
    rowXml(
      1,
      sheet.columns
        .map((column, i) =>
          textCell(`${columnLetter(i)}1`, sheet.headerStyle, column.header, strings),
        )
        .join(""),
    ),
  ]
  for (let row = 2; row <= lastRow; row++) {
    const values = rows[row - 2] ?? []
    const cells = sheet.columns.map((column, i) => {
      const cellRef = `${columnLetter(i)}${row}`
      const value = values[i] ?? ""
      return column.date
        ? dateCell(cellRef, sheet.dateStyle, value)
        : textCell(cellRef, sheet.textStyle, value, strings)
    })
    if (cells.some(Boolean)) xmlRows.push(rowXml(row, cells.join("")))
  }

  const textNumbers = sheet.columns.flatMap((column, i) =>
    column.textNumbers ? [bodyRange(i)] : [],
  )

  const sheetXml = worksheetXml({
    cols: sheet.columns
      .map(
        (column, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${column.width}" customWidth="1"/>`,
      )
      .join(""),
    rows: xmlRows,
    // One dropdown per column, like the template
    dataValidations: sheet.columns.flatMap((column, i) =>
      column.options
        ? [
            `<dataValidation type="list" allowBlank="1" sqref="${bodyRange(i)}"><formula1>"${escapeXml(column.options)}"</formula1></dataValidation>`,
          ]
        : [],
    ),
    ignoredErrors: textNumbers.length
      ? `<ignoredErrors><ignoredError sqref="${textNumbers.join(" ")}" numberStoredAsText="1"/></ignoredErrors>`
      : "",
    hasTable: true,
  })

  // The template's tables have no filter buttons; they are added because
  // INICIO tells Paula to search and sort with the arrow in the header.
  const tableXml =
    XML_HEADER +
    `<table xmlns="${MAIN_NS}" id="${tableId}" name="${sheet.table}" displayName="${sheet.table}" ref="${ref}" totalsRowShown="0">` +
    `<autoFilter ref="${ref}"/>` +
    `<tableColumns count="${sheet.columns.length}">` +
    sheet.columns
      .map(
        (column, i) =>
          `<tableColumn id="${i + 1}" name="${escapeXml(column.header)}"/>`,
      )
      .join("") +
    "</tableColumns>" +
    '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>' +
    "</table>"

  return { sheetXml, tableXml }
}

function relationshipsXml(targets: [type: string, target: string][]): string {
  return (
    XML_HEADER +
    `<Relationships xmlns="${PACKAGE_REL_NS}">` +
    targets
      .map(
        ([type, target], i) =>
          `<Relationship Id="rId${i + 1}" Type="${REL_NS}/${type}" Target="${target}"/>`,
      )
      .join("") +
    "</Relationships>"
  )
}

// Every part of the .xlsx package (path and XML), in zip order
export function patientWorkbookParts({
  patients,
  sessions,
}: PatientWorkbookData): [path: string, xml: string][] {
  const strings = createStringTable()
  const tableSheets: [TableSheet, (string | null)[][]][] = [
    [
      PACIENTES,
      patients.map((patient) =>
        sheetRow(PACIENTES, {
          "Apellido y nombre": patient.name,
          "Fecha apertura": patient.openedOn,
          "Teléfono": patient.phone,
        }),
      ),
    ],
    [
      SESIONES,
      sessions.map((session) =>
        sheetRow(SESIONES, {
          "Fecha": session.date,
          "Apellido y nombre": session.name,
          "Tratamiento realizado": session.treatments,
          "Próxima sesión": session.nextSession,
        }),
      ),
    ],
    [
      LISTA_RAPIDA,
      patients.map((patient) =>
        sheetRow(LISTA_RAPIDA, {
          "Apellido y nombre": patient.name,
          "Teléfono": patient.phone,
        }),
      ),
    ],
  ]

  const parts: [path: string, xml: string, contentType?: string][] = [
    [
      "_rels/.rels",
      relationshipsXml([["officeDocument", "xl/workbook.xml"]]),
    ],
    [
      "xl/workbook.xml",
      XML_HEADER +
        `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        [INICIO.name, ...tableSheets.map(([sheet]) => sheet.name)]
          .map(
            (name, i) =>
              `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join("") +
        '</sheets><calcPr calcId="191029"/></workbook>',
      `${SPREADSHEETML}.sheet.main+xml`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      relationshipsXml([
        ["worksheet", "worksheets/sheet1.xml"],
        ...tableSheets.map(
          (_, i): [string, string] => [
            "worksheet",
            `worksheets/sheet${i + 2}.xml`,
          ],
        ),
        ["styles", "styles.xml"],
        ["theme", "theme/theme1.xml"],
        ["sharedStrings", "sharedStrings.xml"],
      ]),
    ],
    ["xl/styles.xml", STYLES_XML, `${SPREADSHEETML}.styles+xml`],
    [
      "xl/theme/theme1.xml",
      THEME_XML,
      "application/vnd.openxmlformats-officedocument.theme+xml",
    ],
    [
      "xl/worksheets/sheet1.xml",
      inicioSheetXml(strings),
      `${SPREADSHEETML}.worksheet+xml`,
    ],
  ]
  tableSheets.forEach(([sheet, rows], i) => {
    const { sheetXml, tableXml } = tableSheetXml(sheet, rows, strings, i + 1)
    parts.push(
      [`xl/worksheets/sheet${i + 2}.xml`, sheetXml, `${SPREADSHEETML}.worksheet+xml`],
      [
        `xl/worksheets/_rels/sheet${i + 2}.xml.rels`,
        relationshipsXml([["table", `../tables/table${i + 1}.xml`]]),
      ],
      [`xl/tables/table${i + 1}.xml`, tableXml, `${SPREADSHEETML}.table+xml`],
    )
  })
  // Last: every sheet has added its strings by now
  parts.push([
    "xl/sharedStrings.xml",
    strings.xml(),
    `${SPREADSHEETML}.sharedStrings+xml`,
  ])

  const contentTypes =
    XML_HEADER +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    parts
      .filter(([, , contentType]) => contentType)
      .map(
        ([path, , contentType]) =>
          `<Override PartName="/${path}" ContentType="${contentType}"/>`,
      )
      .join("") +
    "</Types>"

  return [
    ["[Content_Types].xml", contentTypes],
    ...parts.map(([path, xml]): [string, string] => [path, xml]),
  ]
}

export function buildPatientWorkbook(
  input: PatientWorkbookInput,
): Uint8Array<ArrayBuffer> {
  const files: Record<string, Uint8Array> = {}
  for (const [path, xml] of patientWorkbookParts(
    preparePatientWorkbook(input),
  )) {
    files[path] = strToU8(xml)
  }
  return zipSync(files)
}

export function patientWorkbookFileName(today: string): string {
  return `Fichero_Digital_Pacientes_Paula_Guerendiain_${today}.xlsx`
}

// Fonts, fills and formats of the template (Carlito, grey #5B5B5B text, blue
// #B8DDE7 and beige #F3EADF headers, dd/mm/yyyy dates); see STYLE above.
const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Carlito"/></font>
<font><b/><sz val="18"/><color rgb="FF5B5B5B"/><name val="Carlito"/></font>
<font><b/><sz val="12"/><color rgb="FF5B5B5B"/><name val="Carlito"/></font>
<font><b/><sz val="13"/><color rgb="FF5B5B5B"/><name val="Carlito"/></font>
<font><sz val="11"/><color rgb="FF5B5B5B"/><name val="Carlito"/></font>
<font><b/><sz val="10"/><color rgb="FF5B5B5B"/><name val="Carlito"/></font>
<font><b/><sz val="11"/><color rgb="FF5B5B5B"/><name val="Carlito"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFB8DDE7"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3EADF"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// Only the colors matter here: the tables' row stripes come from accent1.
// Same Office 2023 palette as the template.
const THEME_XML = `${XML_HEADER}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements>
<a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="0E2841"/></a:dk2>
<a:lt2><a:srgbClr val="E8E8E8"/></a:lt2>
<a:accent1><a:srgbClr val="156082"/></a:accent1>
<a:accent2><a:srgbClr val="E97132"/></a:accent2>
<a:accent3><a:srgbClr val="196B24"/></a:accent3>
<a:accent4><a:srgbClr val="0F9ED5"/></a:accent4>
<a:accent5><a:srgbClr val="A02B93"/></a:accent5>
<a:accent6><a:srgbClr val="4EA72E"/></a:accent6>
<a:hlink><a:srgbClr val="467886"/></a:hlink>
<a:folHlink><a:srgbClr val="96607D"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office">
<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`
