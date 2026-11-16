// Careerly "classic" CV template (ARCHITECTURE.md §9).
//
// One column, standard section titles, selectable text and embedded fonts, so ATS can parse it (RNF-09).
// It is also the reference for user templates: see ../README.md for the contract all templates follow.
// The CV comes as JSON (`TemplateData` from @careerly/contracts) and every value is placed as plain text:
// nothing from the user is ever evaluated as Typst code (RNF-05).

#let data = json(sys.inputs.at("data", default: "data.json"))
#let labels = data.labels

#let accent = rgb("#1f3a5f")
#let muted = luma(90)

// --- Formatting helpers -----------------------------------------------------------------------------------

/// "2023-04" -> "abr. 2023" / "Apr 2023".
#let month(value) = {
  let (year, number) = value.split("-")
  labels.months.at(int(number) - 1) + " " + year
}

/// "ene. 2020 – actualidad"; only the dates that exist. A start without an end is ongoing.
#let period(start, end) = {
  let from = if start != none { month(start) }
  let to = if end != none { month(end) } else if start != none { labels.present }
  let parts = (from, to).filter(part => part != none)
  if parts.len() > 0 { parts.join(" – ") }
}

/// Joins the present values with a separator; `none` when there are none.
#let joined(values, separator) = {
  let present = values.filter(value => value != none)
  if present.len() > 0 { present.join(separator) }
}

/// "https://github.com/ana/" -> "github.com/ana".
#let bare-url(url) = url.replace(regex("^https?://(www\.)?"), "").trim("/", at: end)

// --- Page and text ----------------------------------------------------------------------------------------

#set document(title: data.basics.name + " — CV", author: data.basics.name)
#set page(
  paper: data.paper,
  margin: (x: 1.8cm, top: 1.5cm, bottom: 1.6cm),
  footer: context {
    let total = counter(page).final().first()
    if total > 1 {
      set text(size: 8pt, fill: muted)
      align(right)[#counter(page).display() / #total]
    }
  },
)
// No hyphenation: an ATS looks for whole keywords.
#set text(font: "Source Sans 3", size: 10.5pt, lang: data.language, hyphenate: false, fill: luma(15))
#set par(justify: false, leading: 0.5em, spacing: 0.6em)
#set list(marker: [•], indent: 0.2em, body-indent: 0.5em, spacing: 0.45em)
#show link: set text(fill: accent)

#show heading.where(level: 1): it => block(
  width: 100%,
  above: 1.2em,
  below: 0.65em,
  inset: (bottom: 3pt),
  stroke: (bottom: 0.6pt + accent),
  sticky: true,
  text(size: 11pt, weight: "semibold", fill: accent, tracking: 0.04em, upper(it.body)),
)

// --- Building blocks --------------------------------------------------------------------------------------

/// Title line (left) with dates (right), an optional second line, then bullets. The header never ends a page.
#let entry(title, dates: none, detail: none, items: ()) = {
  block(above: 0.95em, below: 0.5em, sticky: items.len() > 0)[
    #text(weight: "semibold")[#title]
    #if dates != none [#h(1fr) #text(fill: muted)[#dates]]
    #if detail != none [\ #text(fill: muted)[#detail]]
  ]
  if items.len() > 0 {
    list(..items.map(item => [#item]))
  }
}

/// A section with a standard title, only when it has something to show.
#let section(key, values, body) = if values.len() > 0 {
  heading(level: 1, labels.sections.at(key))
  body
}

// --- Header -----------------------------------------------------------------------------------------------

#let basics = data.basics

#block(below: 0.9em)[
  #text(size: 21pt, weight: "semibold", fill: accent)[#basics.name]
  #if basics.headline != none [\ #text(size: 12pt)[#basics.headline]]
  #v(0.15em)
  #set text(size: 9.5pt, fill: muted)
  // Each item is boxed so a line only breaks between items, never inside an address or URL.
  #let contact = (
    if basics.location != none [#basics.location],
    if basics.email != none { link("mailto:" + basics.email, basics.email) },
    if basics.phone != none [#basics.phone],
    ..basics.links.map(item => link(item.url, if item.label != none { item.label } else { bare-url(item.url) })),
  )
  #joined(contact.filter(item => item != none).map(box), [ #sym.dot.c ])
]

// --- Sections (fixed, standard order) ---------------------------------------------------------------------

#if data.summary != none {
  heading(level: 1, labels.sections.summary)
  par[#data.summary]
}

#section("experience", data.experience, for position in data.experience {
  entry(
    position.title,
    dates: period(position.startDate, position.endDate),
    detail: joined((position.company, position.location), ", "),
    items: position.bullets,
  )
})

#section("projects", data.projects, for project in data.projects {
  entry(
    joined((project.name, project.role), " — "),
    dates: period(project.startDate, project.endDate),
    detail: if project.url != none { link(project.url, bare-url(project.url)) },
    items: project.bullets,
  )
})

#section("skills", data.skills, for group in data.skills {
  block(above: 0.55em, below: 0.55em)[
    #if group.label != none [#text(weight: "semibold")[#group.label:] ]
    #group.items.join(", ")
  ]
})

#section("education", data.education, for item in data.education {
  entry(
    joined((item.title, item.field), ", "),
    dates: period(item.startDate, item.endDate),
    detail: item.institution,
  )
})

#section("certifications", data.certifications, for item in data.certifications {
  entry(
    item.name,
    dates: if item.issueDate != none { month(item.issueDate) },
    detail: item.issuer,
  )
})

#section("languages", data.languages, block(
  above: 0.55em,
  joined(data.languages.map(item => item.language + " (" + labels.levels.at(item.level) + ")"), " · "),
))
