/**
 * One or more examples of every Mermaid diagram type, written for this app. They use the same
 * syntax features as the examples on Mermaid's "All Diagram Examples" page
 * (https://mermaid.js.org/syntax/all-examples.html, Mermaid 12.3.0), with their own subjects,
 * names and connections, so the gallery shows what each type can do.
 */

export interface MermaidExample {
  /** Unique within its section. */
  id: string;
  title: string;
  code: string;
}

export interface MermaidExampleSection {
  /** The diagram type, as a slug. */
  id: string;
  title: string;
  examples: MermaidExample[];
}

export const MERMAID_EXAMPLES: MermaidExampleSection[] = [
  {
    id: 'flowchart',
    title: 'Flowchart',
    examples: [
      {
        id: 'morning-routine',
        title: 'Morning Routine',
        code: `flowchart TD
    A[Alarm rings] -->|Get up| B(Make breakfast)
    B --> C{What to drink?}
    C -->|Hot| D[Tea]
    C -->|Cold| E[Juice]
    C -->|Strong| F[fa:fa-mug-hot Coffee]
`,
      },
      {
        id: 'library-book-loan',
        title: 'Library Book Loan',
        code: `flowchart TD
    Enter([Walk into library]) --> Search[Search the catalogue]
    Search --> Found{Book on the shelf?}
    Found -->|No| Reserve[Place a reservation]
    Reserve --> Search
    Found -->|Yes| Card[Scan library card]
    Card --> Allowed{Loan limit reached?}
    Allowed -->|Yes| Return[Return an old book first]
    Return --> Card
    Allowed -->|No| Stamp[Book checked out]
    Stamp --> Leave([Read at home])

    style Enter fill:#e3f2fd,stroke:#1e88e5
    style Leave fill:#e3f2fd,stroke:#1e88e5
    style Allowed fill:#fce4ec,stroke:#d81b60
`,
      },
      {
        id: 'mobile-app-release-with-subgraphs',
        title: 'Mobile App Release with Subgraphs',
        code: `flowchart LR
    subgraph design[Design]
        Sketch[Sketch screens] --> Review[Design review]
    end

    subgraph build[Build]
        Compile[Compile app] --> Lint[Run linters]
        Lint --> Check{All green?}
    end

    subgraph ship[Store release]
        Beta[Beta testers] --> Submit[Submit to store]
        Submit --> Live[Available to everyone]
    end

    Review --> Compile
    Check -->|Yes| Beta
    Check -->|No| Sketch
`,
      },
      {
        id: 'insurance-claim-with-expanded-shapes',
        title: 'Insurance Claim with Expanded Shapes',
        code: `flowchart TD
    Claim@{ shape: manual-input, label: "Customer reports damage" }
    Photos@{ shape: docs, label: "Photos and receipts" }
    Rules@{ shape: procs, label: "Fraud and policy checks" }
    Covered@{ shape: diam, label: "Damage covered?" }
    Ledger@{ shape: cyl, label: "Claims ledger" }
    Payout@{ shape: stadium, label: "Pay the customer" }

    Claim --> Photos
    Photos --> Rules
    Rules --> Covered
    Covered -->|Yes| Ledger
    Covered -->|No| Claim
    Ledger --> Payout
`,
      },
    ],
  },
  {
    id: 'c4-diagram',
    title: 'C4 Diagram',
    examples: [
      {
        id: 'online-learning-platform-context',
        title: 'Online Learning Platform Context',
        code: `C4Context
    title System Context diagram for an Online Learning Platform
    Enterprise_Boundary(e0, "SchoolGroup") {
        Person(student, "Student", "Takes courses and submits assignments.")
        Person(teacher, "Teacher")
        Person_Ext(parent, "Parent", "desc")

        Person(tutor, "Tutor", "Helps students, <br/> one group at a time.")

        System(Platform, "Learning Platform", "Hosts courses, quizzes and grades, and sends reminders.")

        Enterprise_Boundary(e1, "Campus") {
            SystemDb_Ext(Records, "Student Records", "Stores enrolment, grades and attendance for every student.")

            System_Boundary(e2, "Content") {
                System(Video, "Video Service")
                System(Quiz, "Quiz Engine", "Builds and scores quizzes. second line.")
            }

            System_Ext(Mail, "Mail Relay", "The campus mail server.")
            SystemDb(Library, "Course Library Database", "All course material and versions.")

            Boundary(e3, "Messaging", "boundary") {
                SystemQueue(Events, "Event Queue", "Course events.")
                SystemQueue_Ext(Push, "Push Queue", "Mobile notifications to students.")
            }
        }
    }

    BiRel(student, Platform, "Studies with")
    BiRel(Platform, Records, "Syncs")
    Rel(Platform, Mail, "Sends reminders", "SMTP")
    Rel(Mail, student, "Delivers reminders to")
`,
      },
      {
        id: 'ride-sharing-container-diagram',
        title: 'Ride Sharing Container Diagram',
        code: `C4Container
    title Container diagram for a Ride Sharing Service

    Person(rider, "Rider", "Someone who books rides")
    System_Ext(maps, "Maps Provider", "Routes and travel times")

    Container_Boundary(r1, "Ride Sharing") {
        Container(rider_app, "Rider App", "Kotlin, Swift", "Books rides and pays")
        Container(driver_app, "Driver App", "Kotlin, Swift", "Accepts rides and navigates")
        Container(web, "Web Portal", "TypeScript, React", "Ride history and receipts")
        ContainerDb(trips, "Trips Database", "PostgreSQL", "Stores trips, payments and ratings")
        Container(dispatch, "Dispatch API", "Go, Kubernetes", "Matches riders with drivers")
    }

    Rel(rider, rider_app, "Books with", "HTTPS")
    Rel(rider, web, "Checks receipts", "HTTPS")
    Rel(rider_app, dispatch, "Requests rides", "JSON/HTTPS")
    Rel(driver_app, dispatch, "Reports location", "gRPC")
    Rel(web, dispatch, "Reads history")
    Rel(dispatch, trips, "Reads from and writes to", "SQL")
    Rel(dispatch, maps, "Gets routes from", "HTTPS")
    Rel(maps, driver_app, "Sends turn-by-turn directions")
`,
      },
    ],
  },
  {
    id: 'ishikawa-diagram',
    title: 'Ishikawa Diagram',
    examples: [
      {
        id: 'slow-website',
        title: 'Slow Website',
        code: `
ishikawa-beta
    Slow Website
    Code
        Too many database queries
        Large images not compressed
        No caching
    People
        No performance budget
    Infrastructure
        DATABASE
            Missing index
            Slow disk
        NETWORK
            No CDN
            Far-away region
    Traffic
        Bot traffic spikes
        Marketing campaign launch
`,
      },
      {
        id: 'missed-train',
        title: 'Missed Train',
        code: `
ishikawa-beta
    Missed The Train
    Process
        Left home too late
        Ticket bought at the station
    People
        Overslept
        Waited for a friend
    Equipment
        Phone battery empty
        Bike had a flat tyre
    Environment
        Snow on the roads
        Platform changed last minute
    Measurement
        Clock five minutes slow
`,
      },
    ],
  },
  {
    id: 'kanban-diagram',
    title: 'Kanban Diagram',
    examples: [
      {
        id: 'website-redesign-board',
        title: 'Website Redesign Board',
        code: `---
config:
  kanban:
    ticketBaseUrl: 'https://example.com/tickets/#TICKET#'
---
kanban
  backlog[Backlog]
    copy[Rewrite the about page]
    photos[Shoot new team photos]@{ priority: 'Low' }
  doing[Doing]
    nav[Simplify the navigation menu]@{ assigned: 'sam', priority: 'High' }
  review[In review]
    forms[Validate the contact form]@{ ticket: 142, assigned: 'R.Okafor', priority: 'High' }
  shipped[Shipped]
    logo[New logo in the header]@{ assigned: 'sam' }
    longTitle[Make every page load in under two seconds on a slow mobile connection, even with all images]@{ ticket: 98, assigned: 'lee', priority: 'Very High' }
`,
      },
      {
        id: 'home-projects-board',
        title: 'Home Projects Board',
        code: `kanban
  Ideas
    [Paint the hallway]
    [Build a bird house]
  [This weekend]
    [Fix the leaking tap]
  Finished
    [Clean the gutters]
    [Plant tomatoes]
`,
      },
    ],
  },
  {
    id: 'class-diagram',
    title: 'Class Diagram',
    examples: [
      {
        id: 'vehicle-inheritance',
        title: 'Vehicle Inheritance',
        code: `classDiagram
    Vehicle <|-- Car
    Vehicle <|-- Bicycle
    Vehicle <|-- Truck
    Vehicle : +int wheels
    Vehicle : +String color
    Vehicle: +isMotorized()
    Vehicle: +move()
    class Car{
      +int doors
      +honk()
      +park()
    }
    class Bicycle{
      -int gears
      -ringBell()
    }
    class Truck{
      +int loadTons
      +unload()
    }
`,
      },
      {
        id: 'library-domain-model',
        title: 'Library Domain Model',
        code: `classDiagram
    direction LR
    class Member {
        +String name
        +String cardNumber
        +join()
        +borrow() Loan
    }
    class Loan {
        +Date dueDate
        +List~Copy~ copies
        +extend(int days, bool online)
        +isOverdue() bool
    }
    class Copy {
        +int shelf
        +String condition
    }
    class Book {
        +String title
        +String isbn
    }
    class Notifier {
        <<interface>>
        +send(String message) bool
    }
    class EmailNotifier {
        +String address
        +send(String message) bool
    }
    class SmsNotifier {
        +String phone
        +send(String message) bool
    }

    Member "1" --> "0..*" Loan : opens
    Loan "1" *-- "1..*" Copy : holds
    Copy "0..*" --> "1" Book : copy of
    Notifier <|.. EmailNotifier
    Notifier <|.. SmsNotifier
    Loan --> Notifier : reminds via

    note for Notifier "New channels only
need to implement send()"
`,
      },
    ],
  },
  {
    id: 'sequence-diagram',
    title: 'Sequence Diagram',
    examples: [
      {
        id: 'basic-sequence',
        title: 'Basic Sequence',
        code: `sequenceDiagram
    Client->>+Server: Open a connection
    Client->>+Server: Send the request
    Server-->>-Client: Here is the response
    Server-->>-Client: Connection closed
`,
      },
      {
        id: 'hotel-booking',
        title: 'Hotel Booking',
        code: `sequenceDiagram
    autonumber
    actor Guest
    participant Site as Booking Site
    participant Hotel as Hotel System
    participant Card as Card Network

    Guest->>Site: Choose dates and room
    activate Site
    Site->>Hotel: Hold the room
    activate Hotel
    Hotel->>Card: Pre-authorize deposit
    Card-->>Hotel: Deposit result
    alt Deposit accepted
        Hotel-->>Site: Room booked
        Site-->>Guest: Send confirmation
    else Deposit refused
        Hotel-->>Site: Room released
        Site-->>Guest: Ask for another card
    end
    deactivate Hotel
    deactivate Site
`,
      },
      {
        id: 'taxi-ride-with-parallel-actions',
        title: 'Taxi Ride with Parallel Actions',
        code: `sequenceDiagram
    participant App as Rider App
    participant API as Dispatch Service
    participant Billing
    actor Driver

    App->>API: Request a ride
    Note right of API: Find nearby cars,<br/>estimate the fare
    par Reserve a driver
        API->>Driver: New ride offer
    and Confirm to rider
        API-->>App: Driver found, arriving in 5 min
    end
    Driver-->>API: Rider picked up
    API->>Billing: Start the meter
    loop Every minute
        Driver->>App: Share position
    end
    Driver-->>App: Ride finished
`,
      },
    ],
  },
  {
    id: 'pie-chart',
    title: 'Pie Chart',
    examples: [
      {
        id: 'favorite-fruits',
        title: 'Favorite Fruits',
        code: `pie title Favorite fruits in our class
    "Apples" : 42
    "Bananas" : 31
    "Cherries" : 12
`,
      },
      {
        id: 'weekend-hours-with-values',
        title: 'Weekend Hours with Values',
        code: `pie showData title How a Saturday is spent (hours)
    "Sleeping" : 9
    "Outdoors" : 4
    "Cooking and eating" : 3
    "Reading" : 2
    "Chores" : 1.5
`,
      },
    ],
  },
  {
    id: 'user-journey-diagram',
    title: 'User Journey Diagram',
    examples: [
      {
        id: 'making-breakfast',
        title: 'Making Breakfast',
        code: `journey
    title Making breakfast
    section Kitchen
      Boil water: 4: Me
      Toast bread: 3: Me
      Burn the toast: 1: Me, Dog
    section Table
      Eat breakfast: 6: Me
      Wash the dishes: 2: Me
`,
      },
      {
        id: 'moving-house',
        title: 'Moving House',
        code: `journey
    title Moving to a new flat
    section Search
      Browse listings: 5: Renter
      Visit flats: 3: Renter
      Sign the lease: 6: Renter
    section Pack
      Buy boxes: 4: Renter
      Pack the kitchen: 2: Renter
    section Move
      Load the van: 3: Movers
      Carry up the stairs: 1: Movers
      First night at home: 7: Renter
`,
      },
    ],
  },
  {
    id: 'mindmap',
    title: 'Mindmap',
    examples: [
      {
        id: 'learning-mermaid',
        title: 'Learning Mermaid',
        code: `mindmap
  root((Mermaid))
    Diagrams
      Flowcharts
      ::icon(fa fa-diagram-project)
      Sequence
        Messages between participants
    Syntax
      Plain text<br/>in the repo
      Front matter
        Config
            Themes
            Looks
            Layouts
    Tools
      Live editor
      Merbutler
`,
      },
      {
        id: 'garden-planning-with-shapes-and-icons',
        title: 'Garden Planning with Shapes and Icons',
        code: `mindmap
  root((Spring Garden))
    Beds
      Raised bed
      Herb spiral
    Plants
      ::icon(fa fa-seedling)
      Tomatoes
      Beans
      Sunflowers
    Tools
      Hand tools
        Trowel
        Pruning shears
      water{{Water daily!}}
    Wildlife
      ::icon(fa fa-dove)
      Bird feeder
      Bee hotel
      Small pond
`,
      },
    ],
  },
  {
    id: 'requirement-diagram',
    title: 'Requirement Diagram',
    examples: [
      {
        id: 'smart-thermostat',
        title: 'Smart Thermostat',
        code: `requirementDiagram

    requirement comfort {
        id: 1
        text: Rooms reach the set temperature within 30 minutes.
        risk: high
        verifymethod: test
    }

    functionalRequirement schedule {
        id: 1.1
        text: Users can set a weekly heating schedule.
        risk: medium
        verifymethod: test
    }

    performanceRequirement accuracy {
        id: 1.2
        text: Measured temperature within 0.5 degrees.
        risk: medium
        verifymethod: demonstration
    }

    designConstraint battery_life {
        id: 1.3
        text: Runs two years on two AA batteries.
        risk: low
        verifymethod: inspection
    }

    element sensor_board {
        type: hardware
        docRef: "docs/sensor-board"
    }

    element lab_tests {
        type: "test plan"
        docRef: "qa/lab-tests"
    }

    comfort - contains -> schedule
    comfort - contains -> accuracy
    schedule - derives -> battery_life
    sensor_board - satisfies -> accuracy
    lab_tests - verifies -> accuracy
`,
      },
    ],
  },
  {
    id: 'radar-diagram',
    title: 'Radar Diagram',
    examples: [
      {
        id: 'weekly-fitness',
        title: 'Weekly Fitness',
        code: `---
title: "Fitness"
---
radar-beta
  axis r["Running"], c["Cycling"], s["Swimming"]
  axis y["Yoga"], w["Weights"], h["Hiking"]
  curve k["Kim"]{60, 80, 40, 70, 55, 90}
  curve j["Jo"]{85, 50, 75, 40, 80, 60}

  max 100
  min 0
`,
      },
      {
        id: 'laptop-comparison-with-polygon-grid',
        title: 'Laptop Comparison with Polygon Grid',
        code: `radar-beta
  title Laptop Comparison
  axis cpu["Speed"], bat["Battery"], scr["Screen"]
  axis wt["Light weight"], price["Price"]

  curve air["Ultrabook"]{3, 5, 4, 5, 2}
  curve pro["Workstation"]{5, 2, 5, 2, 1}
  curve budget["Budget"]{2, 4, 2, 3, 5}

  graticule polygon
  max 5
  min 0
`,
      },
    ],
  },
  {
    id: 'state-diagram',
    title: 'State Diagram',
    examples: [
      {
        id: 'basic-state-diagram',
        title: 'Basic State Diagram',
        code: `stateDiagram-v2
    [*] --> Idle
    Idle --> [*]
    Idle --> Brewing
    Brewing --> Idle
    Brewing --> Jammed
    Jammed --> [*]
`,
      },
      {
        id: 'parcel-lifecycle-with-composite-states',
        title: 'Parcel Lifecycle with Composite States',
        code: `stateDiagram-v2
    direction LR
    [*] --> Booked
    Booked --> Labelled : label printed
    Booked --> Withdrawn : sender cancels
    Labelled --> InTransit
    state InTransit {
        [*] --> Sorting
        Sorting --> OnTruck : loaded at the hub
        OnTruck --> [*]
    }
    InTransit --> Delivered : signed for
    Delivered --> [*]
    Withdrawn --> [*]
    note right of Labelled
        Labels can be printed
        at home or at a shop
    end note
`,
      },
      {
        id: 'choice-and-concurrency',
        title: 'Choice and Concurrency',
        code: `stateDiagram-v2
    state charge_check <<choice>>
    [*] --> Booting
    Booting --> charge_check
    charge_check --> SafeMode : charge < 10%
    charge_check --> Running : charge >= 10%
    state Running {
        [*] --> Downloading
        Downloading --> Installing : done
        Installing --> Downloading : retry
        --
        [*] --> Online
        Online --> Offline : signal lost
        Offline --> Online : reconnected
    }
    SafeMode --> [*] : shut down
    Running --> [*] : shut down
`,
      },
    ],
  },
  {
    id: 'entity-relationship-diagram',
    title: 'Entity Relationship Diagram',
    examples: [
      {
        id: 'school-enrollment',
        title: 'School Enrollment',
        code: `erDiagram
    STUDENT ||--o{ ENROLLMENT : makes
    COURSE ||--|{ ENROLLMENT : receives
    TEACHER ||--o{ COURSE : teaches
    STUDENT {
        string id
        string name
        date birthday
    }
    COURSE {
        string code
        string title
        int credits
    }
    TEACHER {
        string id
        string name
        string office
    }
    ENROLLMENT {
        date enrolledOn
        string grade
    }
`,
      },
      {
        id: 'music-library-with-keys-and-comments',
        title: 'Music Library with Keys and Comments',
        code: `erDiagram
    LISTENER ||--o{ PLAYLIST : creates
    ARTIST ||--o{ ALBUM : "released as"
    PLAYLIST ||--o{ PLAYLIST_ENTRY : holds
    TRACK ||--o{ PLAYLIST_ENTRY : "added to"
    ALBUM ||--|{ TRACK : contains
    LISTENER {
        string id PK
        string username UK "Shown on profiles"
        string country
    }
    PLAYLIST {
        string id PK
        string listenerId FK
        string name
        bool isPublic
    }
    ARTIST {
        string id PK
        string name "Stage name"
        int debutYear
    }
    ALBUM {
        string id PK
        string artistId FK
        string title
    }
    TRACK {
        string id PK
        string albumId FK
        int number
        int seconds
    }
    PLAYLIST_ENTRY {
        string playlistId FK
        string trackId FK
        date addedAt
        int position
    }
`,
      },
    ],
  },
  {
    id: 'git-graph',
    title: 'Git Graph',
    examples: [
      {
        id: 'basic-git-flow',
        title: 'Basic Git Flow',
        code: `gitGraph
    commit id: "init"
    branch staging
    checkout staging
    commit id: "add login"
    commit id: "add logout"
    checkout main
    merge staging id: "release 1"
    commit id: "update readme"
    branch search
    checkout search
    commit id: "search box"
    commit id: "search results"
    checkout main
    merge search id: "release 2"
`,
      },
      {
        id: 'release-and-hotfix-workflow',
        title: 'Release and Hotfix Workflow',
        code: `gitGraph
    commit id: "project skeleton"
    branch develop
    commit id: "feat: cart"
    commit id: "feat: checkout"
    checkout main
    merge develop tag: "v2.0.0"
    checkout develop
    commit id: "feat: wishlist"
    checkout main
    branch hotfix
    commit id: "fix: tax rounding"
    checkout main
    merge hotfix tag: "v2.0.1"
    checkout develop
    cherry-pick id: "fix: tax rounding"
    commit id: "feat: gift cards"
    checkout main
    merge develop tag: "v2.1.0"
`,
      },
      {
        id: 'highlighted-commits',
        title: 'Highlighted Commits',
        code: `gitGraph TB:
    commit id: "new parser"
    commit id: "drop old API" type: HIGHLIGHT
    commit id: "undo cache change" type: REVERSE
    commit id: "polish" tag: "v3.0.0-beta"
`,
      },
    ],
  },
  {
    id: 'architecture-diagram',
    title: 'Architecture Diagram',
    examples: [
      {
        id: 'photo-storage',
        title: 'Photo Storage',
        code: `architecture-beta
    group media(cloud)[Media]

    service meta(database)[Metadata] in media
    service hot(disk)[Hot Storage] in media
    service cold(disk)[Archive] in media
    service thumbs(server)[Thumbnailer] in media

    meta:L -- R:thumbs
    hot:T -- B:thumbs
    cold:T -- B:meta
`,
      },
      {
        id: 'shop-with-public-and-private-groups',
        title: 'Shop with Public and Private Groups',
        code: `architecture-beta
    group public(cloud)[Public]
    group private(cloud)[Private]

    service shop(internet)[Shop Website] in public
    service app(internet)[Shop App] in public
    service orders(server)[Orders API] in private
    service pay(server)[Payments] in private
    service stock(database)[Stock] in private
    service images(disk)[Images] in private

    shop:R --> L:orders
    app:R --> L:orders
    orders:R --> L:pay
    orders:B --> T:stock
    stock:R -- L:images
`,
      },
      {
        id: 'queue-workers-with-junctions',
        title: 'Queue Workers with Junctions',
        code: `architecture-beta
    service client(internet)[Client]
    service queue(server)[Job Queue]
    service w1(server)[Worker 1]
    service w2(server)[Worker 2]
    junction split

    client:R -- L:queue
    queue:R -- L:split
    w1:B -- T:split
    w2:T -- B:split
`,
      },
    ],
  },
  {
    id: 'xy-chart',
    title: 'XY Chart',
    examples: [
      {
        id: 'monthly-rainfall',
        title: 'Monthly Rainfall',
        code: `xychart-beta
    title "Monthly Rainfall"
    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]
    y-axis "Rain (in mm)" 20 --> 120
    bar [80, 65, 60, 45, 50, 40, 35, 45, 60, 85, 100, 95]
    line [80, 65, 60, 45, 50, 40, 35, 45, 60, 85, 100, 95]
`,
      },
      {
        id: 'ice-cream-sales-with-data-labels',
        title: 'Ice Cream Sales with Data Labels',
        code: `---
config:
  xyChart:
    showDataLabel: true
---
xychart-beta
    title "Scoops sold on Sunday"
    x-axis [Vanilla, Chocolate, "Salted Caramel", Lemon, Mint]
    y-axis "Scoops" 0 --> 150
    bar [120, 140, 85, 40, 55]
`,
      },
      {
        id: 'downloads-vs-uninstalls',
        title: 'Downloads vs Uninstalls',
        code: `---
config:
  themeVariables:
    xyChart:
      plotColorPalette: '#16a34a, #ea580c'
---
xychart-beta
    title "App downloads vs uninstalls"
    x-axis [Jan, Feb, Mar, Apr]
    y-axis "Installs" 0 --> 800
    line [150, 340, 560, 720]
    line [30, 80, 110, 150]
`,
      },
    ],
  },
  {
    id: 'sankey-diagram',
    title: 'Sankey Diagram',
    examples: [
      {
        id: 'household-energy-use',
        title: 'Household Energy Use',
        code: `sankey-beta

Grid,Home,520
Solar panels,Home,180
Home,Heating,260
Home,Kitchen,120
Home,Lighting,60
Home,Laundry,90
Home,Electronics,170
`,
      },
      {
        id: 'website-visitor-funnel',
        title: 'Website Visitor Funnel',
        code: `sankey-beta

Visitors,Product page,900
Product page,Left the site,520
Product page,Added to cart,380
Added to cart,Abandoned cart,150
Added to cart,Checkout,230
Checkout,Payment failed,30
Checkout,Paid,200
Paid,Returned,20
Paid,Kept,180
`,
      },
      {
        id: 'water-use-in-a-town',
        title: 'Water Use in a Town',
        code: `---
config:
  sankey:
    showValues: false
---
sankey-beta

River,Treatment plant,620.5
Wells,Treatment plant,210.25
Rain tanks,Gardens,35.75
Treatment plant,Losses,48.4
Treatment plant,Homes,402.6
Treatment plant,Businesses,214.9
Treatment plant,Public use,164.85
Homes,Showers,120.3
Homes,Toilets,98.1
Homes,Kitchen,61.7
Homes,Gardens,52.4
Homes,Laundry,70.1
Businesses,Restaurants,64.2
Businesses,Offices,40.5
Businesses,Factories,110.2
Public use,Parks,74.3
Public use,Pools,48.15
Public use,Fire service,12.4
Public use,Street cleaning,30
Showers,Sewer,120.3
Toilets,Sewer,98.1
Kitchen,Sewer,61.7
Laundry,Sewer,70.1
Factories,Sewer,95
Sewer,Wastewater plant,445.2
Wastewater plant,Sea,430
Wastewater plant,Sludge,15.2
`,
      },
    ],
  },
  {
    id: 'gantt-chart',
    title: 'Gantt Chart',
    examples: [
      {
        id: 'garden-renovation',
        title: 'Garden Renovation',
        code: `gantt
    title Garden Renovation
    dateFormat YYYY-MM-DD
    section Prepare
        Clear old plants     :done, clear, 2024-04-01, 5d
        Draw the plan        :done, plan, after clear, 3d
    section Build
        Lay the paths        :active, paths, after plan, 10d
        Build raised beds    :beds, after paths, 6d
    section Plant
        Plant vegetables     :veg, after paths, 7d
        Garden party         :milestone, after beds, 0d
`,
      },
      {
        id: 'conference-planning-with-dependencies',
        title: 'Conference Planning with Dependencies',
        code: `gantt
    title Conference Planning
    dateFormat YYYY-MM-DD
    excludes weekends

    section Venue
        Shortlist venues     :done, venues, 2024-02-05, 5d
        Sign the contract    :done, contract, 2024-02-07, 4d

    section Program
        Open submissions     :active, cft, after venues, 10d
        Pick the speakers    :speakers, after cft, 7d
        Program published    :milestone, after speakers, 0d

    section Logistics
        Book catering        :crit, catering, after contract, 12d
        Print badges         :badges, after speakers, 4d
        Set up rooms         :setup, after badges, 2d

    section Event
        Rehearsal            :rehearsal, after setup catering, 1d
        Conference day       :milestone, after rehearsal, 0d
`,
      },
    ],
  },
  {
    id: 'timeline-diagram',
    title: 'Timeline Diagram',
    examples: [
      {
        id: 'space-exploration',
        title: 'Space Exploration',
        code: `timeline
    title Milestones of space exploration
    1957 : Sputnik 1
    1961 : First human in orbit
         : First American in space
    1969 : Moon landing
    1971 : First space station
`,
      },
      {
        id: 'year-plan-with-sections',
        title: 'Year Plan with Sections',
        code: `timeline
    title Team plan for the year
    section H1 Build
        January : Hire two engineers : Pick the stack
        March : Prototype ready
        May : Private beta
    section H2 Grow
        July : Public launch
        September : Android app : Team plan
        November : First conference talk
`,
      },
    ],
  },
  {
    id: 'quadrant-chart',
    title: 'Quadrant Chart',
    examples: [
      {
        id: 'feature-priorities',
        title: 'Feature Priorities',
        code: `quadrantChart
    title Value and effort of planned features
    x-axis Low Effort --> High Effort
    y-axis Low Value --> High Value
    quadrant-1 Plan carefully
    quadrant-2 Do now
    quadrant-3 Maybe later
    quadrant-4 Avoid
    Dark mode: [0.25, 0.7]
    Offline sync: [0.8, 0.85]
    Export to PDF: [0.4, 0.3]
    Custom themes: [0.65, 0.35]
    Keyboard shortcuts: [0.2, 0.55]
    Plugin system: [0.9, 0.6]
`,
      },
      {
        id: 'weekly-chores-with-styled-points',
        title: 'Weekly Chores with Styled Points',
        code: `quadrantChart
    title Chores this week
    x-axis Can wait --> Due soon
    y-axis Small --> Big
    quadrant-1 Plan a slot
    quadrant-2 Ask for help
    quadrant-3 Skip
    quadrant-4 Do today
    Pay the rent: [0.92, 0.88] radius: 9
    Clean the garage: [0.2, 0.9]
    Water the plants: [0.75, 0.15]
    Sort old photos: [0.1, 0.4]
    Fix the bike light: [0.6, 0.3]
    classDef urgent color: #d92d20
    Renew insurance:::urgent: [0.85, 0.6]
`,
      },
    ],
  },
  {
    id: 'packet-diagram',
    title: 'Packet Diagram',
    examples: [
      {
        id: 'ipv4-header',
        title: 'IPv4 Header',
        code: `---
title: "IPv4 Header"
---
packet
0-3: "Version"
4-7: "IHL"
8-13: "DSCP"
14-15: "ECN"
16-31: "Total Length"
32-47: "Identification"
48: "Reserved"
49: "DF"
50: "MF"
51-63: "Fragment Offset"
64-71: "Time To Live"
72-79: "Protocol"
80-95: "Header Checksum"
96-127: "Source Address"
128-159: "Destination Address"
160-191: "(Options)"
`,
      },
      {
        id: 'sensor-frame-with-relative-bits',
        title: 'Sensor Frame with Relative Bits',
        code: `packet
title Sensor Frame
+8: "Start Byte"
+8: "Sensor Id"
+16: "Temperature"
+16: "Humidity"
48-79: "Timestamp"
`,
      },
    ],
  },
  {
    id: 'block-diagram',
    title: 'Block Diagram',
    examples: [
      {
        id: 'smart-home-hub',
        title: 'Smart Home Hub',
        code: `block-beta
  columns 3
  phone(("Phone")):3
  space:3
  hub["Home Hub"] lights["Lights"] logs[("Event Log")]

  phone --> hub
  hub --> lights
  lights --> logs

  style phone fill:#e1bee7,stroke:#8e24aa
  style logs fill:#c8e6c9,stroke:#43a047
`,
      },
      {
        id: 'block-arrows-and-nested-blocks',
        title: 'Block Arrows and Nested Blocks',
        code: `block-beta
columns 1
  src(("Source"))
  arrowDown<["&nbsp;&nbsp;&nbsp;"]>(down)
  block:STAGES
    Parse
    Check["Type check the whole program"]
    Emit
  end
  space
  Out
  STAGES --> Out
  Emit --> Out
  style Check fill:#9cf,stroke:#333,stroke-width:4px
`,
      },
    ],
  },
  {
    id: 'treemap',
    title: 'Treemap',
    examples: [
      {
        id: 'holiday-budget',
        title: 'Holiday Budget',
        code: `---
config:
  treemap:
    valueFormat: '$0,0'
---
treemap-beta
"Summer Holiday"
    "Travel"
        "Flights": 900
        "Trains": 140
        "Taxis": 60
    "Stay"
        "Hotel": 1100
        "Camping": 120
    "Food"
        "Restaurants": 450
        "Groceries": 160
    "Fun"
        "Museums": 80
        "Boat trip": 150
`,
      },
      {
        id: 'photo-library-with-styling',
        title: 'Photo Library with Styling',
        code: `treemap-beta
"Photo Library"
    "Travel":::big
        "Japan": 140
        "Norway": 90
        "Portugal": 35
    "Family"
        "Birthdays": 45
        "Holidays": 25
    "Screenshots": 20
    "Pets": 55

classDef big fill:#fc9,stroke:#333;
`,
      },
    ],
  },
  {
    id: 'use-case-diagram',
    title: 'Use Case Diagram',
    examples: [
      {
        id: 'basic-use-cases',
        title: 'Basic Use Cases',
        code: `usecase-beta
actor Client("Client")
actor Teller("Bank teller")
CheckBalance("Check balance")
Transfer("Transfer money")
OpenAccount("Open an account")
PrintStatement("Print a statement")
Client --> CheckBalance
Client --> Transfer
Teller --> OpenAccount
Teller --> PrintStatement
`,
      },
      {
        id: 'system-boundaries',
        title: 'System Boundaries',
        code: `usecase-beta
actor Reader("Reader")
actor Librarian("Librarian")
systemBoundary "Library System"
  SearchCatalogue("Search the catalogue")
  BorrowBook("Borrow a book")
  RenewLoan("Renew a loan")
end
systemBoundary "Staff Portal"
  AddBooks("Add new books")
  ChaseLateReturns("Chase late returns")
end
Staff_Portal@{ type: package }
Reader --> SearchCatalogue
Reader --> BorrowBook
Reader --> RenewLoan
Librarian --> AddBooks
Librarian --> ChaseLateReturns
`,
      },
      {
        id: 'actor-collaboration',
        title: 'Actor Collaboration',
        code: `usecase-beta
actor Writer("Writer")
actor Editor("Editor")
actor Publisher("Publisher")
DraftArticle("Draft an article")
EditArticle("Edit the article")
Publish("Publish online")
Writer --> DraftArticle
Editor --> EditArticle
Publisher --> Publish
Writer -- "works with" --> Editor
Publisher --> Writer
`,
      },
    ],
  },
  {
    id: 'event-modeling-diagram',
    title: 'Event Modeling Diagram',
    examples: [
      {
        id: 'table-reservation-story',
        title: 'Table Reservation Story',
        code: `eventmodeling

tf 01 ui BookingUI
tf 02 cmd ReserveTable
tf 03 evt TableReserved
tf 04 rmo ReservationList ->> 03
tf 05 ui ArrivalUI
tf 06 cmd SeatGuests
tf 07 evt GuestsSeated
tf 08 rmo FloorPlan ->> 07
`,
      },
      {
        id: 'shipping-flow-with-data',
        title: 'Shipping Flow with Data',
        code: `eventmodeling

tf 01 ui OrderUI
tf 02 cmd ShipOrder [[ShipOrder01]]
tf 03 evt OrderShipped [[OrderShipped]]

rf 04 evt Carrier.ParcelScanned
tf 05 pcr TrackingProcessor
tf 06 cmd UpdateTracking
tf 07 evt Shop.TrackingUpdated

data ShipOrder01 {
  orderId: 'A-1042'
  boxes: 3
}

data OrderShipped {
  orderId: string
  boxes: number
}
`,
      },
    ],
  },
  {
    id: 'venn-diagram',
    title: 'Venn Diagram',
    examples: [
      {
        id: 'choosing-a-hobby',
        title: 'Choosing a Hobby',
        code: `venn-beta
    title "Picking a new hobby"
    set Fun
    set Cheap
    set Healthy
    union Fun,Cheap["Board games"]
    union Cheap,Healthy["Walking"]
    union Fun,Healthy["Climbing"]
    union Fun,Cheap,Healthy["Cycling"]
`,
      },
      {
        id: 'language-skills-with-sizes-and-styles',
        title: 'Language Skills with Sizes and Styles',
        code: `venn-beta
    title "Languages spoken in the office"
    set EN["English"]:20
        text en1["Sales"]
        text en2["Support"]
    set ES["Spanish"]:12
        text es1["Logistics"]
        text es2["Finance"]
    union EN,ES["Both"]:6
        text both1["Management"]
    style EN fill:gold
    style ES fill:lightcoral
`,
      },
    ],
  },
  {
    id: 'treeview',
    title: 'TreeView',
    examples: [
      {
        id: 'project-file-structure',
        title: 'Project File Structure',
        code: `treeView-beta
            recipe-app/
                lib/
                    widgets/
                        RecipeCard.tsx
                        SearchBar.tsx
                    main.tsx
                    routes.js
                .editorconfig
                tsconfig.json
                CHANGELOG.md
`,
      },
      {
        id: 'shared-drive-with-quoted-names',
        title: 'Shared Drive with Quoted Names',
        code: `treeView-beta
            "Family Drive"
                "Holiday Photos"
                    "Beach 2023.jpg"
                    "Mountains 2024.jpg"
                "House Papers"
                    "lease.pdf"
                    "insurance notes.md"
                "Recipes"
`,
      },
      {
        id: 'annotations',
        title: 'Annotations',
        code: `---
config:
  treeView:
    showIcons: true
---
treeView-beta
            app/
                server.ts :::highlight icon(logos:nodejs-icon) ## starts the API
                routes.js ## URL table
                theme.css icon(none)
            db/
                seed.sql icon(logos:postgresql)
            .env.example ## copy to .env
            Makefile
            package.json
`,
      },
      {
        id: 'file-type-icons-via-config-maps',
        title: 'File-Type Icons via Config Maps',
        code: `---
config:
  treeView:
    showIcons: true
    defaultIconPack: material-icon-theme
    filenameIcons:
      Makefile: makefile
    extensionIcons:
      .ts: typescript
      .tsx: react-ts
      .log: none
---
treeView-beta
            web-shop/
                src/
                    Cart.tsx
                    prices.ts
                Makefile
                build.log
                README.md
`,
      },
      {
        id: 'unicode-icons-in-filenames',
        title: 'Unicode Icons in Filenames',
        code: `treeView-beta
            🌱 garden-planner/
                📦 modules/
                    🗺️ map/
                    🌦️ weather/
                🧪 checks/
                📝 NOTES.md
                ⚙️ settings.yaml
`,
      },
    ],
  },
  {
    id: 'wardley-maps',
    title: 'Wardley Maps',
    examples: [
      {
        id: 'coffee-shop-value-chain',
        title: 'Coffee Shop Value Chain',
        code: `wardley-beta
title Coffee Shop
size [1100, 800]

anchor Commuter [0.95, 0.60]
anchor Office [0.95, 0.80]
component Cup of Coffee [0.80, 0.62] label [19, -4]
component Paper Cup [0.72, 0.80]
component Beans [0.62, 0.70]
component Grinder [0.50, 0.55]
component Milk [0.40, 0.85]
component Espresso Machine [0.45, 0.38] label [-80, 4]
component Electricity [0.12, 0.90] label [-27, 20]

Commuter -> Cup of Coffee
Office -> Cup of Coffee
Cup of Coffee -> Paper Cup
Cup of Coffee -> Beans
Cup of Coffee -> Grinder
Grinder -> Milk
Grinder -> Espresso Machine
Espresso Machine -> Electricity

evolve Espresso Machine 0.65
evolve Grinder 0.75

note "Cheaper machines let small shops compete" [0.30, 0.50]
note "Milk is a commodity" [0.42, 0.88]
note "Beans quality is the differentiator" [0.66, 0.40]
`,
      },
      {
        id: 'custom-evolution-stages',
        title: 'Custom Evolution Stages',
        code: `wardley-beta
title Research Tooling
size [1100, 800]

evolution Idea -> Prototype -> Product -> Utility

component Scientist Needs [0.95, 0.10]
component Lab Notebook [0.82, 0.20]
component Custom Simulations [0.70, 0.30]
component Shared Datasets [0.62, 0.60]
component Cloud Compute [0.55, 0.88]

Scientist Needs -> Lab Notebook
Lab Notebook -> Custom Simulations
Custom Simulations -> Shared Datasets
Shared Datasets -> Cloud Compute

evolve Custom Simulations 0.55
evolve Shared Datasets 0.80
`,
      },
      {
        id: 'pipeline-components',
        title: 'Pipeline Components',
        code: `wardley-beta
title Lighting Evolution Pipeline
size [1100, 800]

component Room Light [0.60, 0.50]
component Electricity [0.12, 0.85]

Room Light -> Electricity

pipeline Room Light {
  component Candle [0.20] label [-40, 35]
  component Incandescent Bulb [0.50] label [-70, 35]
  component LED Bulb [0.78] label [-30, 35]
}

Candle -> Room Light
Incandescent Bulb -> Room Light
LED Bulb -> Room Light
`,
      },
      {
        id: 'video-streaming-architecture',
        title: 'Video Streaming Architecture',
        code: `wardley-beta
title Video Streaming
size [1100, 800]

anchor Viewer [0.92, 0.60]

component player [0.82, 0.60]
component recommendations [0.70, 0.30] label [1, -9]
component catalogue [0.66, 0.66]
component playback api [0.74, 0.52]
component encoding jobs [0.58, 0.40] label [-80, 2]
component watch history [0.55, 0.62] label [-60, -12]
component ranking model [0.45, 0.25] label [-15, -17]
component mobile app [0.82, 0.70] label [-14, 27]
component smart tv app [0.82, 0.78] label [-15, 27]
component web app [0.82, 0.86] label [-14, 28]
component cdn [0.40, 0.82]
component object storage [0.28, 0.88] label [-40, 12]
component transcoder [0.48, 0.55] label [-50, 15]
component codecs [0.30, 0.70]
component analytics events [0.35, 0.45] label [-70, -20]
component compute [0.15, 0.92]
component licensing deals [0.60, 0.20] label [-60, 15]

Viewer -> player

player -> playback api
player -> recommendations
playback api -> catalogue
playback api -> cdn
playback api -> watch history

recommendations -> ranking model
ranking model -> analytics events
ranking model -> watch history

encoding jobs -> transcoder
transcoder -> codecs
transcoder -> compute
cdn -> object storage
object storage -> compute

catalogue -> licensing deals
catalogue -> encoding jobs

pipeline player {
  component player v1 [0.30]
  component player v2 [0.75]
}

pipeline ranking model {
  component rules [0.50]
  component neural ranking [0.20]
}

deaccelerator Regional Licensing [0.18, 0.60]

annotations [1, 0]
annotation 1,[0.50, 0.15] "Ranking models change every quarter"
annotation 2,[0.45, 0.78] "Bandwidth is a commodity now"
annotation 3,[0.62, 0.22] "Deals decide what can be shown"

note "Codec choice affects every device" [0.25, 0.60]
`,
      },
    ],
  },
  {
    id: 'cynefin-framework',
    title: 'Cynefin Framework',
    examples: [
      {
        id: 'customer-support-triage',
        title: 'Customer Support Triage',
        code: `cynefin-beta
  title Customer Support Triage

  complex
    "Churn after the redesign"
    "Try a new onboarding call"

  complicated
    "Billing mismatch across systems"
    "Ask the payments team"

  clear
    "Password reset"
    "Resend the invoice"

  chaotic
    "Site down for everyone"

  confusion
    "Ticket with no details"

  complex --> complicated : "Cause narrowed down"
  clear --> chaotic : "Outdated runbook"
`,
      },
      {
        id: 'team-practices-with-domain-transitions',
        title: 'Team Practices with Domain Transitions',
        code: `cynefin-beta
  title Team Practices

  complex
    "Remote culture"
    "New product line"

  complicated
    "Hiring pipeline"
    "Cloud cost tuning"

  clear
    "Expense reports"
    "Laptop setup"

  chaotic
    "Security breach"

  complex --> complicated : "Experiments converge"
  complicated --> clear : "Checklist agreed"
  clear --> chaotic : "Nobody owns it"
  chaotic --> complex : "Fire is out"
`,
      },
    ],
  },
  {
    id: 'railroad-diagram-ir',
    title: 'Railroad Diagram (IR)',
    examples: [
      {
        id: 'boolean-expression-grammar',
        title: 'Boolean Expression Grammar',
        code: `railroad-beta
    title Boolean Expression Grammar

    disjunction = sequence(
        nonterminal("conjunction"),
        zeroOrMore(sequence(
            terminal("or"),
            nonterminal("conjunction")
        ))
    ) ;
    conjunction = sequence(
        nonterminal("negation"),
        zeroOrMore(sequence(
            terminal("and"),
            nonterminal("negation")
        ))
    ) ;
    negation = choice(
        sequence(terminal("not"), nonterminal("negation")),
        nonterminal("atom")
    ) ;
    atom = choice(terminal("true"), terminal("false"), sequence(terminal("("), nonterminal("disjunction"), terminal(")"))) ;
`,
      },
      {
        id: 'csv-grammar',
        title: 'CSV Grammar',
        code: `railroad-beta
    title CSV Grammar

    file = sequence(nonterminal("record"), zeroOrMore(sequence(terminal("newline"), nonterminal("record")))) ;
    record = sequence(nonterminal("field"), zeroOrMore(sequence(terminal(","), nonterminal("field")))) ;
    field = choice(nonterminal("quoted"), nonterminal("plain"), terminal("")) ;
    quoted = sequence(terminal("\\""), zeroOrMore(nonterminal("char")), terminal("\\"")) ;
    plain = oneOrMore(nonterminal("char")) ;
`,
      },
    ],
  },
  {
    id: 'railroad-diagram-ebnf',
    title: 'Railroad Diagram (EBNF)',
    examples: [
      {
        id: 'date-grammar',
        title: 'Date Grammar',
        code: `railroad-ebnf-beta
    title Date Grammar

    date = year "-" month "-" day ;
    year = digit digit digit digit ;
    month = "0" digit | "1" ( "0" | "1" | "2" ) ;
    day = ( "0" | "1" | "2" ) digit | "3" ( "0" | "1" ) ;
    digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
`,
      },
      {
        id: 'url-path',
        title: 'URL Path',
        code: `railroad-ebnf-beta
    title URL Path

    path = ( "/" segment )+ ( "?" query )? ;
    segment = ( letter | digit | "-" )* ;
    query = pair ( "&" pair )* ;
    pair = name "=" value ;
    name = letter+ ;
    value = ( letter | digit )* ;
    letter = "a" | "b" | "c" ;
    digit = "0" | "1" | "2" ;
`,
      },
    ],
  },
  {
    id: 'railroad-diagram-abnf',
    title: 'Railroad Diagram (ABNF)',
    examples: [
      {
        id: 'hex-color',
        title: 'Hex Color',
        code: `railroad-abnf-beta
    title Hex Color

    color = "#" ( 6HEXDIG / 3HEXDIG ) ;
    HEXDIG = DIGIT / "A" / "B" / "C" / "D" / "E" / "F" ;
`,
      },
      {
        id: 'time-of-day',
        title: 'Time of Day',
        code: `railroad-abnf-beta
    title Time of Day

    time = hour ":" minute [ ":" second ] ;
    hour = 2DIGIT ;
    minute = 2DIGIT ;
    second = 2DIGIT ;
`,
      },
    ],
  },
  {
    id: 'railroad-diagram-peg',
    title: 'Railroad Diagram (PEG)',
    examples: [
      {
        id: 'list-grammar',
        title: 'List Grammar',
        code: `railroad-peg-beta
    title List Grammar

    List <- "[" Items? "]" ;
    Items <- Item ("," Item)* ;
    Item <- Number / Word / List ;
    Number <- Digit+ ;
    Word <- Letter+ ;
    Digit <- "0" / "1" / "2" ;
    Letter <- "a" / "b" / "c" ;
`,
      },
      {
        id: 'numbers-with-predicates',
        title: 'Numbers with Predicates',
        code: `railroad-peg-beta
    title Numbers (no leading zero)

    Number <- "0" / !"0" Digit Digit* ;
    Digit <- "0" / "1" / "2" / "3" ;
`,
      },
    ],
  },
  {
    id: 'swimlane-diagram',
    title: 'Swimlane Diagram',
    examples: [
      {
        id: 'expense-claim',
        title: 'Expense Claim',
        code: `swimlane-beta LR
  subgraph Employee
    submit[Submit receipt]
    paid[Money received]
  end

  subgraph Manager
    check[Check the claim]
    approve[Approve claim]
  end

  subgraph Finance
    audit[Audit the receipt]
    transfer[Transfer money]
  end

  submit --> check
  check -->|Small amount| approve
  check -->|Over the limit| audit
  audit --> transfer --> approve
  approve --> paid
`,
      },
      {
        id: 'content-review',
        title: 'Content Review',
        code: `swimlane-beta LR
  subgraph authors [Authors]
    draft([Write draft])
    revise[Revise text]
  end

  subgraph editors [Editors]
    ok{Ready to publish?}
    publish((Published))
  end

  draft --> revise --> ok
  ok -->|Yes| publish
  ok -->|No| revise
`,
      },
    ],
  },
];
