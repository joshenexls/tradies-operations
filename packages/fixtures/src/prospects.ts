import type { ProspectFixture } from './types'

/**
 * Twenty hand-written UK prospects. Phones use Ofcom drama ranges only
 * (0113/0114/0161 496 0xxx and 07700 900xxx) and every domain is .example so
 * no fixture can ever leak into a real dial or crawl. Evidence quotes with
 * source 'own_website' appear verbatim in the fixture's scrapeMarkdown.
 */
export const allProspectFixtures: ProspectFixture[] = [
  {
    key: 'leeds-plumber-swift',
    businessName: 'Swift Flow Plumbing',
    trade: 'plumber',
    town: 'Leeds',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://swiftflowplumbing.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Swift Flow Plumbing',
      trade: 'plumber',
      town: 'Leeds',
      phone: { value: '0113 496 0721', source: 'overture' },
      email: { value: 'info@swiftflowplumbing.example', source: 'own_website' },
      serviceAreas: ['Leeds', 'Headingley', 'Horsforth', 'Pudsey'],
      services: [
        {
          value: 'Boiler repairs',
          source: 'own_website',
          quote: 'We repair and service all makes of boiler',
        },
        {
          value: 'Bathroom installation',
          source: 'own_website',
          quote: 'Full bathroom installations from design to finish',
        },
        {
          value: 'Emergency plumbing',
          source: 'own_website',
          quote: '24 hour emergency plumbing across Leeds',
        },
      ],
      accreditations: [
        { id: 'watersafe', source: 'own_website', quote: 'WaterSafe approved installer' },
      ],
      foundedYear: { value: 2011, source: 'own_website', quote: 'serving Leeds since 2011' },
      claims: [{ value: 'Fully insured', source: 'own_website', quote: 'We are fully insured' }],
      companiesHouseNumber: '08214563',
    },
    scrapeMarkdown: `# Swift Flow Plumbing

Family plumbers serving Leeds since 2011. We are fully insured and a WaterSafe approved installer.

## Our services

- Boilers: We repair and service all makes of boiler.
- Bathrooms: Full bathroom installations from design to finish.
- Emergencies: 24 hour emergency plumbing across Leeds.

Covering Leeds, Headingley, Horsforth and Pudsey.

Call 0113 496 0721 or email info@swiftflowplumbing.example.
`,
    places: { placeId: 'fx-place-leeds-plumber-swift', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: {
      companyNumber: '08214563',
      companyName: 'SWIFT FLOW PLUMBING LTD',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-leeds-plumber-swift',
      name: 'Swift Flow Plumbing',
      phone: '0113 496 0721',
      website: 'http://swiftflowplumbing.example',
      address: '14 Otley Road, Leeds',
      postcode: 'LS6 3AA',
    },
    psi: { performance: 24, https: false },
  },
  {
    key: 'sheffield-electrician-hallam',
    businessName: 'Hallam Electrical Services',
    trade: 'electrician',
    town: 'Sheffield',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://hallamelectrical.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Hallam Electrical Services',
      trade: 'electrician',
      town: 'Sheffield',
      phone: { value: '0114 496 0333', source: 'overture' },
      email: { value: 'info@hallamelectrical.example', source: 'own_website' },
      serviceAreas: ['Sheffield', 'Hillsborough', 'Ecclesall', 'Chesterfield'],
      services: [
        { value: 'House rewires', source: 'own_website', quote: 'Full and partial house rewires' },
        {
          value: 'Fuse board upgrades',
          source: 'own_website',
          quote: 'Consumer unit and fuse board upgrades',
        },
        {
          value: 'Electrical testing',
          source: 'own_website',
          quote: 'EICR testing for landlords and homeowners',
        },
      ],
      accreditations: [
        { id: 'niceic', source: 'own_website', quote: 'NICEIC Approved Contractor' },
      ],
      claims: [],
      companiesHouseNumber: '06754321',
    },
    scrapeMarkdown: `# Hallam Electrical Services

NICEIC Approved Contractor working across Sheffield, Hillsborough, Ecclesall and Chesterfield.

## What we do

- Full and partial house rewires.
- Consumer unit and fuse board upgrades.
- EICR testing for landlords and homeowners.

Ring 0114 496 0333 or write to info@hallamelectrical.example.
`,
    places: {
      placeId: 'fx-place-sheffield-electrician-hallam',
      hasWebsite: true,
      isFacebookOnly: false,
    },
    companiesHouse: {
      companyNumber: '06754321',
      companyName: 'HALLAM ELECTRICAL SERVICES LIMITED',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-sheffield-electrician-hallam',
      name: 'Hallam Electrical Services',
      phone: '0114 496 0333',
      website: 'http://hallamelectrical.example',
      address: '2 Middlewood Road, Sheffield',
      postcode: 'S6 4GX',
    },
    psi: { performance: 31, https: false },
  },
  {
    key: 'stockport-heating-mellor',
    businessName: 'Mellor Heating & Gas',
    trade: 'heating',
    town: 'Stockport',
    entityType: 'individual',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://mellorheating.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Mellor Heating & Gas',
      trade: 'heating',
      town: 'Stockport',
      phone: { value: '0161 496 0842', source: 'overture' },
      email: { value: 'bookings@mellorheating.example', source: 'own_website' },
      serviceAreas: ['Stockport', 'Marple', 'Bredbury', 'Romiley'],
      services: [
        {
          value: 'Boiler installation',
          source: 'own_website',
          quote: 'New A-rated boiler installations',
        },
        {
          value: 'Boiler servicing',
          source: 'own_website',
          quote: 'Annual boiler servicing and safety checks',
        },
        {
          value: 'Landlord gas safety certificates',
          source: 'own_website',
          quote: 'Landlord gas safety certificates (CP12)',
        },
      ],
      accreditations: [
        { id: 'gas-safe', source: 'own_website', quote: 'Gas Safe registered 512346' },
      ],
      foundedYear: { value: 2005, source: 'own_website', quote: 'established in 2005' },
      claims: [
        {
          value: 'Fully insured',
          source: 'own_website',
          quote: 'fully insured for your peace of mind',
        },
      ],
    },
    scrapeMarkdown: `# Mellor Heating & Gas

Gas Safe registered 512346. A one-man heating business established in 2005, fully insured for your peace of mind.

## Services

- New A-rated boiler installations.
- Annual boiler servicing and safety checks.
- Landlord gas safety certificates (CP12).

Covering Stockport, Marple, Bredbury and Romiley. Call 0161 496 0842.
`,
    places: {
      placeId: 'fx-place-stockport-heating-mellor',
      hasWebsite: true,
      isFacebookOnly: false,
    },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-stockport-heating-mellor',
      name: 'Mellor Heating & Gas',
      phone: '0161 496 0842',
      website: 'http://mellorheating.example',
      address: '8 Longhurst Lane, Stockport',
      postcode: 'SK6 5AB',
    },
    psi: { performance: 18, https: false },
  },
  {
    key: 'leeds-roofer-aire',
    businessName: 'Aire Valley Roofing',
    trade: 'roofer',
    town: 'Leeds',
    entityType: 'individual',
    hasWebsite: false,
    isFacebookOnly: true,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Aire Valley Roofing',
      trade: 'roofer',
      town: 'Leeds',
      phone: { value: '07700 900412', source: 'overture' },
      serviceAreas: ['Leeds', 'Kirkstall', 'Bramley'],
      services: [
        { value: 'Roof repairs', source: 'operator' },
        { value: 'Flat roofing', source: 'operator' },
      ],
      accreditations: [
        {
          id: 'competent-roofer',
          source: 'operator',
          quote: 'CompetentRoofer register lookup, membership 45871',
        },
      ],
      claims: [],
    },
    places: { placeId: 'fx-place-leeds-roofer-aire', hasWebsite: false, isFacebookOnly: true },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-leeds-roofer-aire',
      name: 'Aire Valley Roofing',
      phone: '07700 900412',
      website: 'https://www.facebook.com/airevalleyroofing',
      address: 'Kirkstall, Leeds',
      postcode: 'LS5 3EH',
    },
    psi: null,
  },
  {
    key: 'bristol-builder-brunel',
    businessName: 'Brunel Build & Renovate',
    trade: 'builder',
    town: 'Bristol',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'https://brunelbuild.example',
    expectedSegment: 'fine',
    facts: {
      businessName: 'Brunel Build & Renovate',
      trade: 'builder',
      town: 'Bristol',
      phone: { value: '07700 900218', source: 'overture' },
      email: { value: 'hello@brunelbuild.example', source: 'own_website' },
      serviceAreas: ['Bristol', 'Clifton', 'Bedminster', 'Keynsham'],
      services: [
        {
          value: 'House extensions',
          source: 'own_website',
          quote: 'Single and double storey house extensions',
        },
        {
          value: 'Loft conversions',
          source: 'own_website',
          quote: 'Loft conversions with full project management',
        },
        {
          value: 'Kitchen renovations',
          source: 'own_website',
          quote: 'Complete kitchen renovations',
        },
      ],
      accreditations: [
        { id: 'chas', source: 'own_website', quote: 'CHAS accredited contractor' },
        { id: 'trustmark', source: 'own_website', quote: 'TrustMark registered' },
      ],
      foundedYear: {
        value: 2009,
        source: 'own_website',
        quote: 'Building in Bristol since 2009',
      },
      claims: [
        {
          value: 'Fully insured up to £5m',
          source: 'own_website',
          quote: 'fully insured up to £5m',
        },
      ],
      companiesHouseNumber: '09876543',
    },
    places: { placeId: 'fx-place-bristol-builder-brunel', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: {
      companyNumber: '09876543',
      companyName: 'BRUNEL BUILD & RENOVATE LTD',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-bristol-builder-brunel',
      name: 'Brunel Build & Renovate',
      phone: '07700 900218',
      website: 'https://brunelbuild.example',
      address: '31 North Street, Bristol',
      postcode: 'BS3 1EN',
    },
    psi: { performance: 91, https: true },
  },
  {
    key: 'harrogate-plumber-nidd',
    businessName: 'Nidd Plumbing Co',
    trade: 'plumber',
    town: 'Harrogate',
    entityType: 'corporate',
    hasWebsite: false,
    isFacebookOnly: false,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Nidd Plumbing Co',
      trade: 'plumber',
      town: 'Harrogate',
      phone: { value: '07700 900573', source: 'overture' },
      serviceAreas: ['Harrogate', 'Knaresborough', 'Ripon'],
      services: [
        { value: 'General plumbing repairs', source: 'operator' },
        { value: 'Bathroom fitting', source: 'operator' },
        { value: 'Burst pipes and leaks', source: 'operator' },
      ],
      accreditations: [],
      claims: [],
      companiesHouseNumber: '11234567',
    },
    places: {
      placeId: 'fx-place-harrogate-plumber-nidd',
      hasWebsite: false,
      isFacebookOnly: false,
    },
    companiesHouse: {
      companyNumber: '11234567',
      companyName: 'NIDD PLUMBING CO LTD',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-harrogate-plumber-nidd',
      name: 'Nidd Plumbing Co',
      phone: '07700 900573',
      address: 'Knaresborough Road, Harrogate',
      postcode: 'HG2 7SR',
    },
    psi: null,
  },
  {
    key: 'nottingham-electrician-trent',
    businessName: 'Trent Electrical Contractors',
    trade: 'electrician',
    town: 'Nottingham',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://trentelectrical.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Trent Electrical Contractors',
      trade: 'electrician',
      town: 'Nottingham',
      phone: { value: '07700 900664', source: 'overture' },
      email: { value: 'office@trentelectrical.example', source: 'own_website' },
      serviceAreas: ['Nottingham', 'West Bridgford', 'Beeston', 'Arnold'],
      services: [
        {
          value: 'Domestic rewiring',
          source: 'own_website',
          quote: 'Domestic rewiring to the latest regulations',
        },
        {
          value: 'Outdoor and garden electrics',
          source: 'own_website',
          quote: 'Outdoor sockets, lighting and garden electrics',
        },
        {
          value: 'EV charger installation',
          source: 'own_website',
          quote: 'EV charger installation at home',
        },
        {
          value: 'Smoke alarm installation',
          source: 'own_website',
          quote: 'Mains smoke alarm installation',
        },
      ],
      accreditations: [
        { id: 'napit', source: 'own_website', quote: 'NAPIT registered electricians' },
      ],
      foundedYear: { value: 1998, source: 'own_website', quote: 'family firm founded in 1998' },
      claims: [],
      companiesHouseNumber: '05432198',
    },
    scrapeMarkdown: `# Trent Electrical Contractors

A family firm founded in 1998. NAPIT registered electricians covering Nottingham, West Bridgford, Beeston and Arnold.

## Services

- Domestic rewiring to the latest regulations.
- Outdoor sockets, lighting and garden electrics.
- EV charger installation at home.
- Mains smoke alarm installation.

Telephone 07700 900664 — office@trentelectrical.example.
`,
    places: {
      placeId: 'fx-place-nottingham-electrician-trent',
      hasWebsite: true,
      isFacebookOnly: false,
    },
    companiesHouse: {
      companyNumber: '05432198',
      companyName: 'TRENT ELECTRICAL CONTRACTORS LIMITED',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-nottingham-electrician-trent',
      name: 'Trent Electrical Contractors',
      phone: '07700 900664',
      website: 'http://trentelectrical.example',
      address: '77 Radcliffe Road, Nottingham',
      postcode: 'NG2 5FF',
    },
    psi: { performance: 35, https: false },
  },
  {
    key: 'sheffield-roofer-peak',
    businessName: 'Peak District Roofing',
    trade: 'roofer',
    town: 'Sheffield',
    entityType: 'individual',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://peakdistrictroofing.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Peak District Roofing',
      trade: 'roofer',
      town: 'Sheffield',
      phone: { value: '0114 496 0518', source: 'overture' },
      email: { value: 'repairs@peakdistrictroofing.example', source: 'own_website' },
      serviceAreas: ['Sheffield', 'Hathersage', 'Dore', 'Totley'],
      services: [
        {
          value: 'Slate and tile repairs',
          source: 'own_website',
          quote: 'Slate and tile roof repairs',
        },
        {
          value: 'Re-roofing',
          source: 'own_website',
          quote: 'Complete re-roofs in slate and tile',
        },
        {
          value: 'Chimney and leadwork',
          source: 'own_website',
          quote: 'Chimney repairs and leadwork',
        },
      ],
      accreditations: [
        { id: 'competent-roofer', source: 'own_website', quote: 'CompetentRoofer scheme member' },
      ],
      claims: [
        {
          value: 'Fully insured up to £5m',
          source: 'own_website',
          quote: 'fully insured up to £5m',
        },
      ],
    },
    scrapeMarkdown: `# Peak District Roofing

Roofer working out of Sheffield, covering Hathersage, Dore and Totley. CompetentRoofer scheme member and fully insured up to £5m.

## Work we take on

- Slate and tile roof repairs.
- Complete re-roofs in slate and tile.
- Chimney repairs and leadwork.

Call 0114 496 0518 or email repairs@peakdistrictroofing.example.
`,
    places: { placeId: 'fx-place-sheffield-roofer-peak', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-sheffield-roofer-peak',
      name: 'Peak District Roofing',
      phone: '0114 496 0518',
      website: 'http://peakdistrictroofing.example',
      address: 'Ecclesall Road South, Sheffield',
      postcode: 'S11 9PS',
    },
    psi: { performance: 29, https: false },
  },
  {
    key: 'leeds-heating-otley',
    businessName: 'Otley Road Heating',
    trade: 'heating',
    town: 'Leeds',
    entityType: 'individual',
    hasWebsite: false,
    isFacebookOnly: false,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Otley Road Heating',
      trade: 'heating',
      town: 'Leeds',
      phone: { value: '0113 496 0284', source: 'overture' },
      serviceAreas: ['Leeds', 'Headingley', 'Adel'],
      services: [
        { value: 'Boiler breakdown repairs', source: 'operator' },
        { value: 'Central heating installation', source: 'operator' },
      ],
      accreditations: [
        { id: 'gas-safe', source: 'operator', quote: 'Gas Safe register lookup 587123' },
      ],
      claims: [],
    },
    places: { placeId: 'fx-place-leeds-heating-otley', hasWebsite: false, isFacebookOnly: false },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-leeds-heating-otley',
      name: 'Otley Road Heating',
      phone: '0113 496 0284',
      address: 'Otley Road, Leeds',
      postcode: 'LS16 5PS',
    },
    psi: null,
  },
  {
    key: 'stockport-builder-goyt',
    businessName: 'Goyt Valley Builders',
    trade: 'builder',
    town: 'Stockport',
    entityType: 'unknown',
    hasWebsite: false,
    isFacebookOnly: true,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Goyt Valley Builders',
      trade: 'builder',
      town: 'Stockport',
      phone: { value: '07700 900791', source: 'overture' },
      serviceAreas: ['Stockport', 'Whaley Bridge', 'New Mills'],
      services: [
        { value: 'Garden walls and patios', source: 'operator' },
        { value: 'Brickwork repairs', source: 'operator' },
      ],
      accreditations: [],
      claims: [],
    },
    places: { placeId: 'fx-place-stockport-builder-goyt', hasWebsite: false, isFacebookOnly: true },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-stockport-builder-goyt',
      name: 'Goyt Valley Builders',
      phone: '07700 900791',
      website: 'https://www.facebook.com/goytvalleybuilders',
      address: 'Marple, Stockport',
      postcode: 'SK6 7AD',
    },
    psi: null,
  },
  {
    key: 'bristol-electrician-avon',
    businessName: 'Avon Electrical',
    trade: 'electrician',
    town: 'Bristol',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'https://avonelectrical.example',
    expectedSegment: 'fine',
    facts: {
      businessName: 'Avon Electrical',
      trade: 'electrician',
      town: 'Bristol',
      phone: { value: '07700 900345', source: 'overture' },
      email: { value: 'contact@avonelectrical.example', source: 'own_website' },
      serviceAreas: ['Bristol', 'Filton', 'Portishead'],
      services: [
        { value: 'House rewires', source: 'own_website', quote: 'Whole house rewires' },
        {
          value: 'Consumer unit upgrades',
          source: 'own_website',
          quote: 'Consumer unit replacements and upgrades',
        },
        {
          value: 'EICR safety reports',
          source: 'own_website',
          quote: 'EICR safety reports for buyers and landlords',
        },
      ],
      accreditations: [{ id: 'niceic', source: 'own_website', quote: 'NICEIC Approved' }],
      foundedYear: { value: 2014, source: 'own_website', quote: 'trading since 2014' },
      claims: [{ value: 'Fully insured', source: 'own_website', quote: 'fully insured' }],
      companiesHouseNumber: '07651234',
    },
    places: {
      placeId: 'fx-place-bristol-electrician-avon',
      hasWebsite: true,
      isFacebookOnly: false,
    },
    companiesHouse: {
      companyNumber: '07651234',
      companyName: 'AVON ELECTRICAL LTD',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-bristol-electrician-avon',
      name: 'Avon Electrical',
      phone: '07700 900345',
      website: 'https://avonelectrical.example',
      address: '5 Gloucester Road, Bristol',
      postcode: 'BS7 8AA',
    },
    psi: { performance: 88, https: true },
  },
  {
    key: 'nottingham-plumber-castle',
    businessName: 'Castle Gate Plumbing',
    trade: 'plumber',
    town: 'Nottingham',
    entityType: 'individual',
    hasWebsite: false,
    isFacebookOnly: false,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Castle Gate Plumbing',
      trade: 'plumber',
      town: 'Nottingham',
      phone: { value: '07700 900129', source: 'overture' },
      serviceAreas: ['Nottingham', 'Sherwood', 'Carlton'],
      services: [
        { value: 'Leak repairs', source: 'operator' },
        { value: 'Tap and toilet repairs', source: 'operator' },
      ],
      accreditations: [],
      claims: [],
    },
    places: {
      placeId: 'fx-place-nottingham-plumber-castle',
      hasWebsite: false,
      isFacebookOnly: false,
    },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-nottingham-plumber-castle',
      name: 'Castle Gate Plumbing',
      phone: '07700 900129',
      address: 'Sherwood, Nottingham',
      postcode: 'NG5 2FW',
    },
    psi: null,
  },
  {
    key: 'harrogate-roofer-stray',
    businessName: 'Stray Side Roofing',
    trade: 'roofer',
    town: 'Harrogate',
    entityType: 'individual',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://straysideroofing.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Stray Side Roofing',
      trade: 'roofer',
      town: 'Harrogate',
      phone: { value: '07700 900836', source: 'overture' },
      email: { value: 'hello@straysideroofing.example', source: 'own_website' },
      serviceAreas: ['Harrogate', 'Starbeck', 'Pannal'],
      services: [
        {
          value: 'Roof repairs',
          source: 'own_website',
          quote: 'Storm damage and general roof repairs',
        },
        {
          value: 'Flat roof replacement',
          source: 'own_website',
          quote: 'Felt and EPDM flat roof replacement',
        },
        {
          value: 'Guttering and fascias',
          source: 'own_website',
          quote: 'New guttering, fascias and soffits',
        },
      ],
      accreditations: [],
      foundedYear: { value: 2016, source: 'own_website', quote: 'Est. 2016' },
      claims: [],
    },
    scrapeMarkdown: `# Stray Side Roofing — Harrogate

Est. 2016. Local roofer for Harrogate, Starbeck and Pannal.

## Services

- Storm damage and general roof repairs.
- Felt and EPDM flat roof replacement.
- New guttering, fascias and soffits.

Call 07700 900836 or email hello@straysideroofing.example for a look at the job.
`,
    places: { placeId: 'fx-place-harrogate-roofer-stray', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-harrogate-roofer-stray',
      name: 'Stray Side Roofing',
      phone: '07700 900836',
      website: 'http://straysideroofing.example',
      address: 'Leeds Road, Harrogate',
      postcode: 'HG2 8AF',
    },
    psi: { performance: 41, https: false },
  },
  {
    key: 'york-heating-minster',
    businessName: 'Minster Heating Services',
    trade: 'heating',
    town: 'York',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://minsterheating.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Minster Heating Services',
      trade: 'heating',
      town: 'York',
      phone: { value: '07700 900457', source: 'overture' },
      email: { value: 'enquiries@minsterheating.example', source: 'own_website' },
      serviceAreas: ['York', 'Acomb', 'Haxby', 'Clifton Moor'],
      services: [
        {
          value: 'Boiler installation',
          source: 'own_website',
          quote: 'New boiler installations across York',
        },
        {
          value: 'Oil boiler servicing',
          source: 'own_website',
          quote: 'Oil fired boiler servicing and repairs',
        },
        {
          value: 'Power flushing',
          source: 'own_website',
          quote: 'Central heating power flushing',
        },
      ],
      accreditations: [
        { id: 'gas-safe', source: 'own_website', quote: 'Gas Safe registered business 198765' },
        { id: 'oftec', source: 'own_website', quote: 'OFTEC registered technician' },
      ],
      foundedYear: { value: 2001, source: 'own_website', quote: 'keeping York warm since 2001' },
      claims: [
        {
          value: 'All engineers DBS checked',
          source: 'own_website',
          quote: 'All our engineers are DBS checked',
        },
      ],
      companiesHouseNumber: '04321987',
    },
    scrapeMarkdown: `# Minster Heating Services

Gas Safe registered business 198765 and OFTEC registered technician — keeping York warm since 2001. All our engineers are DBS checked.

## Services

- New boiler installations across York.
- Oil fired boiler servicing and repairs.
- Central heating power flushing.

Covering York, Acomb, Haxby and Clifton Moor. Call 07700 900457.
`,
    places: { placeId: 'fx-place-york-heating-minster', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: {
      companyNumber: '04321987',
      companyName: 'MINSTER HEATING SERVICES LIMITED',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-york-heating-minster',
      name: 'Minster Heating Services',
      phone: '07700 900457',
      website: 'http://minsterheating.example',
      address: '12 Front Street, York',
      postcode: 'YO24 3BZ',
    },
    psi: { performance: 22, https: false },
  },
  {
    key: 'doncaster-builder-don',
    businessName: 'Don Valley Construction',
    trade: 'builder',
    town: 'Doncaster',
    entityType: 'corporate',
    hasWebsite: false,
    isFacebookOnly: false,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Don Valley Construction',
      trade: 'builder',
      town: 'Doncaster',
      phone: { value: '07700 900682', source: 'overture' },
      serviceAreas: ['Doncaster', 'Bentley', 'Armthorpe'],
      services: [
        { value: 'House extensions', source: 'operator' },
        { value: 'Garage conversions', source: 'operator' },
        { value: 'General building work', source: 'operator' },
      ],
      accreditations: [
        { id: 'chas', source: 'operator', quote: 'CHAS certificate sighted by operator' },
      ],
      claims: [],
      companiesHouseNumber: '10987654',
    },
    places: { placeId: 'fx-place-doncaster-builder-don', hasWebsite: false, isFacebookOnly: false },
    companiesHouse: {
      companyNumber: '10987654',
      companyName: 'DON VALLEY CONSTRUCTION LTD',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-doncaster-builder-don',
      name: 'Don Valley Construction',
      phone: '07700 900682',
      address: 'Bentley Road, Doncaster',
      postcode: 'DN5 9SL',
    },
    psi: null,
  },
  {
    key: 'leeds-other-headrow',
    businessName: 'Headrow Property Maintenance',
    trade: 'other',
    town: 'Leeds',
    entityType: 'individual',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'http://headrowmaintenance.example',
    expectedSegment: 'bad_site',
    facts: {
      businessName: 'Headrow Property Maintenance',
      trade: 'other',
      town: 'Leeds',
      phone: { value: '0113 496 0157', source: 'overture' },
      email: { value: 'jobs@headrowmaintenance.example', source: 'own_website' },
      serviceAreas: ['Leeds', 'Morley', 'Rothwell'],
      services: [
        {
          value: 'Property repairs',
          source: 'own_website',
          quote: 'All property repairs inside and out',
        },
        {
          value: 'Painting and decorating',
          source: 'own_website',
          quote: 'Interior and exterior painting and decorating',
        },
        {
          value: 'Fence and gate repairs',
          source: 'own_website',
          quote: 'Fencing, gates and garden repairs',
        },
      ],
      accreditations: [
        { id: 'trustmark', source: 'own_website', quote: 'TrustMark registered business' },
      ],
      claims: [
        { value: 'Free quotes', source: 'own_website', quote: 'Free quotes with no obligation' },
      ],
    },
    scrapeMarkdown: `# Headrow Property Maintenance

TrustMark registered business. Free quotes with no obligation.

## What we can help with

- All property repairs inside and out.
- Interior and exterior painting and decorating.
- Fencing, gates and garden repairs.

Working across Leeds, Morley and Rothwell. Ring 0113 496 0157 or email jobs@headrowmaintenance.example.
`,
    places: { placeId: 'fx-place-leeds-other-headrow', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-leeds-other-headrow',
      name: 'Headrow Property Maintenance',
      phone: '0113 496 0157',
      website: 'http://headrowmaintenance.example',
      address: 'The Headrow, Leeds',
      postcode: 'LS1 8EQ',
    },
    psi: { performance: 38, https: false },
  },
  {
    key: 'sheffield-other-locks',
    businessName: 'Steel City Locksmiths',
    trade: 'other',
    town: 'Sheffield',
    entityType: 'individual',
    hasWebsite: false,
    isFacebookOnly: true,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Steel City Locksmiths',
      trade: 'other',
      town: 'Sheffield',
      phone: { value: '0114 496 0906', source: 'overture' },
      serviceAreas: ['Sheffield', 'Rotherham'],
      services: [
        { value: 'Emergency lockouts', source: 'operator' },
        { value: 'Lock changes', source: 'operator' },
      ],
      accreditations: [],
      claims: [],
    },
    places: { placeId: 'fx-place-sheffield-other-locks', hasWebsite: false, isFacebookOnly: true },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-sheffield-other-locks',
      name: 'Steel City Locksmiths',
      phone: '0114 496 0906',
      website: 'https://www.facebook.com/steelcitylocksmiths',
      address: 'Abbeydale Road, Sheffield',
      postcode: 'S7 1FS',
    },
    psi: null,
  },
  {
    key: 'bristol-plumber-clifton',
    businessName: 'Clifton Bathrooms & Plumbing',
    trade: 'plumber',
    town: 'Bristol',
    entityType: 'corporate',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'https://cliftonbathrooms.example',
    expectedSegment: 'fine',
    facts: {
      businessName: 'Clifton Bathrooms & Plumbing',
      trade: 'plumber',
      town: 'Bristol',
      phone: { value: '07700 900263', source: 'overture' },
      email: { value: 'studio@cliftonbathrooms.example', source: 'own_website' },
      serviceAreas: ['Bristol', 'Clifton', 'Redland', 'Westbury-on-Trym'],
      services: [
        {
          value: 'Bathroom design and installation',
          source: 'own_website',
          quote: 'Bathrooms designed and installed by our own fitters',
        },
        { value: 'Wet rooms', source: 'own_website', quote: 'Wet rooms and walk-in showers' },
        {
          value: 'General plumbing',
          source: 'own_website',
          quote: 'General plumbing for the home',
        },
      ],
      accreditations: [
        { id: 'watersafe', source: 'own_website', quote: 'WaterSafe approved' },
        { id: 'city-and-guilds', source: 'own_website', quote: 'City & Guilds qualified fitters' },
      ],
      foundedYear: { value: 2007, source: 'own_website', quote: 'established 2007' },
      claims: [{ value: 'Fully insured', source: 'own_website', quote: 'fully insured' }],
      companiesHouseNumber: '06123457',
    },
    places: {
      placeId: 'fx-place-bristol-plumber-clifton',
      hasWebsite: true,
      isFacebookOnly: false,
    },
    companiesHouse: {
      companyNumber: '06123457',
      companyName: 'CLIFTON BATHROOMS & PLUMBING LTD',
      status: 'active',
    },
    overture: {
      overtureId: 'ovt-bristol-plumber-clifton',
      name: 'Clifton Bathrooms & Plumbing',
      phone: '07700 900263',
      website: 'https://cliftonbathrooms.example',
      address: '22 Whiteladies Road, Bristol',
      postcode: 'BS8 2LG',
    },
    psi: { performance: 94, https: true },
  },
  {
    key: 'stockport-electrician-edgeley',
    businessName: 'Edgeley Electrical',
    trade: 'electrician',
    town: 'Stockport',
    entityType: 'unknown',
    hasWebsite: false,
    isFacebookOnly: false,
    expectedSegment: 'no_site',
    facts: {
      businessName: 'Edgeley Electrical',
      trade: 'electrician',
      town: 'Stockport',
      phone: { value: '0161 496 0377', source: 'overture' },
      serviceAreas: ['Stockport', 'Edgeley', 'Cheadle'],
      services: [
        { value: 'Fault finding', source: 'operator' },
        { value: 'Extra sockets and switches', source: 'operator' },
        { value: 'Light fittings', source: 'operator' },
      ],
      accreditations: [],
      claims: [],
    },
    places: {
      placeId: 'fx-place-stockport-electrician-edgeley',
      hasWebsite: false,
      isFacebookOnly: false,
    },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-stockport-electrician-edgeley',
      name: 'Edgeley Electrical',
      phone: '0161 496 0377',
      address: 'Castle Street, Stockport',
      postcode: 'SK3 9AB',
    },
    psi: null,
  },
  {
    key: 'harrogate-heating-spa',
    businessName: 'Spa Town Heating',
    trade: 'heating',
    town: 'Harrogate',
    entityType: 'individual',
    hasWebsite: true,
    isFacebookOnly: false,
    websiteUrl: 'https://spatownheating.example',
    expectedSegment: 'fine',
    facts: {
      businessName: 'Spa Town Heating',
      trade: 'heating',
      town: 'Harrogate',
      phone: { value: '07700 900548', source: 'overture' },
      email: { value: 'hello@spatownheating.example', source: 'own_website' },
      serviceAreas: ['Harrogate', 'Knaresborough', 'Wetherby'],
      services: [
        {
          value: 'Boiler installation',
          source: 'own_website',
          quote: 'Boiler installations sized for your home',
        },
        {
          value: 'Underfloor heating',
          source: 'own_website',
          quote: 'Wet underfloor heating systems',
        },
        {
          value: 'Smart thermostat installation',
          source: 'own_website',
          quote: 'Smart thermostats fitted and set up',
        },
      ],
      accreditations: [
        { id: 'gas-safe', source: 'own_website', quote: 'Gas Safe registered 623410' },
      ],
      foundedYear: { value: 2018, source: 'own_website', quote: 'working for myself since 2018' },
      claims: [],
    },
    places: { placeId: 'fx-place-harrogate-heating-spa', hasWebsite: true, isFacebookOnly: false },
    companiesHouse: null,
    overture: {
      overtureId: 'ovt-harrogate-heating-spa',
      name: 'Spa Town Heating',
      phone: '07700 900548',
      website: 'https://spatownheating.example',
      address: 'Cold Bath Road, Harrogate',
      postcode: 'HG2 0NA',
    },
    psi: { performance: 87, https: true },
  },
]
