// ==================================================================
// FILE TYPE : PAGE (new)
// PURPOSE   :
//   Real policy content — Terms & Conditions, Privacy Policy, Rental
//   Terms, Cancellation & Refund Policy, Damage/Loss/Late Return
//   Policy, Owner Agreement, Community Guidelines, Prohibited Items,
//   Dispute Resolution — kept in ONE page (sectioned, with a jump-to
//   nav) rather than 9 separately routed pages, to keep this
//   reasonable to build and maintain. Content is scoped to what this
//   platform ACTUALLY does today (real messaging, real reviews, no
//   platform/transaction fee yet, no online payment processing yet) —
//   deliberately doesn't promise things that aren't built, matching the
//   same honesty principle used throughout this codebase.
//   NOT A SUBSTITUTE FOR LEGAL REVIEW — this is a real, complete draft,
//   not a final reviewed legal document. A Philippines-qualified lawyer
//   should review this before real transactions occur on the platform.
// CONNECTS TO :
//   Reached via Footer.jsx's links and App.jsx's `legal` page/section
//   params. Referenced by the agreement checkboxes in Profile.jsx
//   (registration), ListEquipment.jsx (listing), and Details.jsx
//   (booking).
// ==================================================================
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, Scale, ShieldAlert } from "lucide-react";

const SECTIONS = [
  ["terms", "Terms & Conditions"],
  ["privacy", "Privacy Policy"],
  ["rental-terms", "Rental Terms"],
  ["cancellation", "Cancellation & Refund Policy"],
  ["damage", "Damage, Loss & Late Return Policy"],
  ["owner-agreement", "Owner Agreement"],
  ["community", "Community Guidelines"],
  ["prohibited", "Prohibited Items Policy"],
  ["disputes", "Dispute Resolution Policy"],
];

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-[#17231D]/8 bg-white p-6 md:p-7 mb-5">
      <h2 className="font-serif text-[21px] md:text-[22px] text-[#17231D] mb-4">{title}</h2>
      <div className="text-[14px] text-[#3c3f38] leading-relaxed space-y-3 [&_h3]:text-[14.5px] [&_h3]:font-semibold [&_h3]:text-[#17231D] [&_h3]:mt-5 [&_h3]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

export default function Legal({ back, initialSection }) {
  const refs = useRef({});
  const [activeSection, setActiveSection] = useState(initialSection || SECTIONS[0][0]);

  useEffect(() => {
    if (initialSection && refs.current[initialSection]) {
      refs.current[initialSection].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialSection]);

  // Scroll-spy — highlights whichever section is currently in view in
  // the sidebar nav, so it's clear where you are in a long document
  // instead of the nav staying static regardless of scroll position.
  useEffect(() => {
    const elements = SECTIONS.map(([id]) => refs.current[id]).filter(Boolean);
    if (!elements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id) => {
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="px-6 md:px-12 py-8 pb-24 md:pb-12 max-w-5xl mx-auto">
      <button onClick={back} className="flex items-center gap-1.5 text-[14px] text-[#17231D]/70 mb-5 hover:text-[#17231D] transition-colors">
        <ChevronLeft size={17} /> Back
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-[#4B5D46]/10 flex items-center justify-center shrink-0">
          <Scale size={19} className="text-[#4B5D46]" />
        </div>
        <h1 className="font-serif text-[26px] md:text-[30px] text-[#17231D]">Legal & Policies</h1>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-[#E2932E]/10 border border-[#E2932E]/25 px-4 py-3 mt-4 mb-7">
        <ShieldAlert size={16} className="text-[#a15c1f] shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-[#8a5a13] leading-relaxed">
          Last updated {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.
          This is a complete policy draft covering how Lendeia currently works — it is not a substitute
          for review by a Philippines-qualified lawyer before real transactions occur on the platform.
        </p>
      </div>

      {/* Mobile: horizontal scrollable pill nav. Desktop: replaced by the
          sticky sidebar below instead (hidden here via md:hidden). */}
      <div className="flex md:hidden gap-1.5 overflow-x-auto pb-1 mb-6 -mx-6 px-6">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => scrollToSection(id)}
            className={`px-3 py-1.5 rounded-full border text-[12px] font-medium shrink-0 transition-colors ${
              activeSection === id
                ? "bg-[#17231D] text-white border-[#17231D]"
                : "border-[#17231D]/12 text-[#4B5D46] hover:bg-[#17231D]/[0.03]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8">
        {/* Desktop sticky sidebar nav */}
        <nav className="hidden md:block sticky top-[96px] self-start">
          <ul className="space-y-0.5">
            {SECTIONS.map(([id, label], i) => (
              <li key={id}>
                <button
                  onClick={() => scrollToSection(id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12.5px] leading-snug transition-colors flex items-start gap-2 ${
                    activeSection === id
                      ? "bg-[#4B5D46]/10 text-[#4B5D46] font-medium"
                      : "text-[#6b6f66] hover:bg-[#17231D]/[0.03] hover:text-[#17231D]"
                  }`}
                >
                  <span className="text-[10.5px] mt-0.5 opacity-60 shrink-0">{i + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div>
      <div ref={(el) => (refs.current.terms = el)} id="terms" className="scroll-mt-28">
        <Section id="terms" title="1. Terms & Conditions">
          <h3>A. About the platform</h3>
          <p>
            Lendeia is a marketplace that connects people who own items ("Owners") with people who
            want to rent them ("Renters"). Lendeia is an intermediary — we are not the owner of listed items,
            and we are not a party to the rental agreement formed between an Owner and a Renter. You can
            reach us via the contact details on this page.
          </p>
          <h3>B. Account requirements</h3>
          <ul>
            <li>You must be at least 18 years old to create a real (non-guest) account.</li>
            <li>Information you provide (name, email, listing details) must be accurate.</li>
            <li>You are responsible for activity on your account, including guest sessions tied to your browser.</li>
            <li>Signing in with Google shares the account information Google provides for authentication.</li>
            <li>We may suspend accounts we reasonably believe are fraudulent or abusive.</li>
          </ul>
          <h3>C. Using the marketplace</h3>
          <ul>
            <li>Users must provide accurate information about themselves and their listings.</li>
            <li>Owners must have the legal right to rent out any item they list.</li>
            <li>Renters must use rented items responsibly and as intended.</li>
            <li>All users must follow applicable Philippine law.</li>
            <li>Users may not attempt to circumvent platform rules (e.g. arranging off-platform payment to avoid dispute protections).</li>
          </ul>
          <h3>D. Listings</h3>
          <p>Owners must accurately describe an item, upload real and representative photos, state its true condition, set accurate availability, set a fair rental price, and disclose known defects. Owners must remove or delist items that are no longer available.</p>
          <p>Prohibited: fake listings, stolen property, illegal items, misleading descriptions, fake or stock photos not of the actual item, counterfeit goods, and anything on our Prohibited Items list below.</p>
          <h3>E. Rental transactions</h3>
          <p>
            A Renter requests a rental for a specific date range at the price shown. A rental is confirmed
            once the Owner accepts the request. Once accepted, the item is reserved for that Renter for the
            requested dates. Pickup/delivery arrangements are made directly between Owner and Renter unless
            otherwise agreed. See our Rental Terms, Cancellation & Refund Policy, and Damage/Loss/Late Return
            Policy for the details of early returns, late returns, and damage.
          </p>
          <h3>F. Payments</h3>
          <p>
            Renters are responsible for paying the rental amount displayed for the transaction. Lendeia does
            not currently charge a platform or transaction fee. Any additional fee would only apply if
            clearly disclosed to you before you confirm a transaction.
          </p>
          <h3>G. Cancellations</h3>
          <p>See our separate Cancellation & Refund Policy below.</p>
          <h3>H. Damage/loss</h3>
          <p>See our separate Damage, Loss & Late Return Policy below.</p>
          <h3>I. Reviews</h3>
          <ul>
            <li>Reviews must reflect genuine experiences.</li>
            <li>Fake reviews, review manipulation, and paying for positive reviews are prohibited.</li>
            <li>Using reviews to harass another user is prohibited.</li>
            <li>We may remove reviews that violate these rules.</li>
          </ul>
          <h3>J. Messages and communications</h3>
          <ul>
            <li>Don't use messaging to scam other users.</li>
            <li>Don't harass, threaten, or impersonate other users.</li>
            <li>Don't send prohibited or illegal content, including via photo attachments.</li>
            <li>We may investigate reported messages where legally permitted, and you can block another user at any time.</li>
          </ul>
          <h3>K. Account suspension</h3>
          <p>We may suspend or terminate accounts for fraud, repeated cancellations, fake listings, non-payment, failure to return items, damage disputes, harassment, listing prohibited items, or serious violations of these terms.</p>
          <h3>L. Liability</h3>
          <p>
            Lendeia facilitates connections between Owners and Renters. We do not guarantee the condition,
            safety, ownership, or behavior of any listed item or any user. To the fullest extent permitted
            by law, Lendeia's liability for any claim relating to the platform is limited.
          </p>
          <h3>M. Disputes</h3>
          <p>See our separate Dispute Resolution Policy below.</p>
          <h3>N. Intellectual property</h3>
          <p>The Lendeia name, logo, branding, software, and original site content are protected and may not be used without permission.</p>
          <h3>O. Changes</h3>
          <p>We may update the service and these policies from time to time. Material changes will be reflected by an updated "last updated" date on this page.</p>
          <h3>P. Governing law</h3>
          <p>These terms are governed by the laws of the Republic of the Philippines.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current.privacy = el)} id="privacy" className="scroll-mt-28">
        <Section id="privacy" title="2. Privacy Policy">
          <h3>Information we collect</h3>
          <ul>
            <li>Name, email, profile photo, and other profile details you provide (username, bio, city, age, gender, phone)</li>
            <li>Location information, only when you choose to share your device location</li>
            <li>Messages you send through the platform, including photo attachments</li>
            <li>Listings you create and your rental history</li>
            <li>Device/browser and basic log information</li>
          </ul>
          <p>We only collect information described here — we don't collect categories of data not listed above.</p>
          <h3>Why we collect it</h3>
          <p>Account creation and authentication, providing the marketplace and messaging features, rental transactions, customer support, fraud and safety review, improving the platform, and legal compliance.</p>
          <h3>Google login</h3>
          <p>If you sign in with Google, Google provides us the account information associated with the permissions you grant during that sign-in.</p>
          <h3>Payments</h3>
          <p>We do not store your payment card details. Payment processing, when applicable, is handled by a payment provider.</p>
          <h3>Data sharing</h3>
          <p>We may share information with service providers who help us run the platform (e.g. our hosting/database provider), other users where necessary to complete a rental (e.g. sharing your name with someone you're renting to/from), and government or law enforcement where legally required.</p>
          <h3>Retention</h3>
          <p>We retain account and transaction information for as long as your account is active and as needed to resolve disputes, comply with legal obligations, and maintain accurate rental history.</p>
          <h3>Your rights</h3>
          <p>Under the Philippine Data Privacy Act, you have rights to access, correct, and request deletion of your personal information. Contact us using the details below to exercise these rights.</p>
          <h3>Security</h3>
          <p>We use reasonable technical and organizational measures to protect your information, including database-level access controls restricting who can see your data.</p>
          <h3>Contact</h3>
          <p>For privacy questions, use the contact channel linked in the app footer.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current["rental-terms"] = el)} id="rental-terms" className="scroll-mt-28">
        <Section id="rental-terms" title="3. Rental Terms">
          <p>These terms govern each individual rental, in addition to the general Terms & Conditions above. Each rental request shows the item, rental price, start/end dates, and total cost before you confirm.</p>
          <h3>Owner responsibilities</h3>
          <ul>
            <li>Own or have the authority to rent out the listed item</li>
            <li>Accurately describe the item and disclose known issues</li>
            <li>Provide the item as described once a rental is accepted</li>
          </ul>
          <h3>Renter responsibilities</h3>
          <ul>
            <li>Pay the agreed rental amount</li>
            <li>Take reasonable care of the item</li>
            <li>Use the item only for its intended purpose</li>
            <li>Not sub-rent or transfer the item to anyone else</li>
            <li>Return the item as agreed</li>
          </ul>
          <h3>Condition evidence</h3>
          <p>Listing photos, messages exchanged, and reviews left after the rental may all serve as evidence of an item's condition before and after a rental.</p>
          <h3>Early return</h3>
          <p>
            Returning an item early does not automatically guarantee a full refund. If a Renter cancels an
            already-accepted, in-progress rental early, the platform recalculates the cost based on the
            number of days actually used, shown alongside the original scheduled cost in your Rental
            History and on the rental's receipt — see the Cancellation & Refund Policy for exactly how this
            is calculated.
          </p>
        </Section>
      </div>

      <div ref={(el) => (refs.current.cancellation = el)} id="cancellation" className="scroll-mt-28">
        <Section id="cancellation" title="4. Cancellation & Refund Policy">
          <h3>Before the Owner accepts</h3>
          <p>A Renter may cancel a Pending request at any time with no charge — the listing was never reserved or taken off the marketplace for a Pending request.</p>
          <h3>After the Owner accepts, before the rental starts</h3>
          <p>Either party may cancel. The listing becomes available again immediately, with its remaining listing time restored (not reset) — see the Owner Agreement for how this affects the listing itself.</p>
          <h3>After the rental has started (early return)</h3>
          <p>
            If a Renter cancels an already-accepted rental while it is in progress (after the start date,
            before the scheduled end date), this is treated as an early return, not an ordinary
            cancellation. The platform recalculates the cost as: daily rate × number of days actually used
            (minimum one day). Both the original scheduled cost and the recalculated cost are shown in your
            Rental History and on the rental's receipt.
          </p>
          <h3>Owner cancels</h3>
          <p>If an Owner cancels an already-accepted rental (e.g. the item becomes unavailable), the Renter owes nothing for that cancelled rental.</p>
          <h3>Refund processing</h3>
          <p>Where an online payment has actually been collected, refund timing may depend on your payment provider or bank in addition to Lendeia's own processing. Lendeia does not currently guarantee instant refunds.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current.damage = el)} id="damage" className="scroll-mt-28">
        <Section id="damage" title="5. Damage, Loss & Late Return Policy">
          <h3>Normal wear</h3>
          <p>Renters are not responsible for ordinary wear and tear from reasonable, intended use of an item.</p>
          <h3>Damage</h3>
          <p>Damage disputes are evaluated using available evidence: listing photos, messages between the parties, and any other relevant evidence submitted through our dispute process.</p>
          <h3>Lost item / non-return</h3>
          <p>If a Renter does not return an item, the Owner should report this through our dispute process. Lendeia may suspend the Renter's account pending review and escalate serious cases (e.g. suspected theft) as legally appropriate.</p>
          <h3>Late return</h3>
          <p>A rental's scheduled end date is shown in the rental request. Returning later than that date without the Owner's agreement is a late return; Lendeia does not currently apply an automatic late fee — Owners and Renters should resolve this directly, or through our dispute process if they can't agree.</p>
          <h3>Disagreement</h3>
          <p>If Owner and Renter disagree about damage, loss, or a late return, either party can open a dispute — see our Dispute Resolution Policy.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current["owner-agreement"] = el)} id="owner-agreement" className="scroll-mt-28">
        <Section id="owner-agreement" title="6. Owner / Lister Agreement">
          <p>By listing an item, an Owner agrees that they have the right to rent it out, that their listing information and photos are accurate, that the item is not a prohibited item, that availability shown is accurate, and that they will honor accepted rental requests.</p>
          <h3>Listing visibility and renewal</h3>
          <p>
            Each listing is publicly visible for a period determined by your current subscription plan.
            When a rental request is accepted, the listing is delisted immediately and its remaining time is
            paused. If the rental is cancelled before completion, the listing becomes available again with
            only its paused remaining time restored — not a fresh period. If the rental completes
            successfully, or if the listing's time runs out unused, the Owner can relist it for a full fresh
            period. This rewards completing rentals and discourages using cancellations to keep refreshing
            a listing's visibility for free.
          </p>
          <h3>Payouts</h3>
          <p>Lendeia does not currently process online payments or payouts on an Owner's behalf. Owners are responsible for arranging payment directly with Renters unless and until Lendeia introduces in-platform payment processing.</p>
          <h3>Taxes</h3>
          <p>Owners are responsible for any tax obligations arising from their rental income under applicable Philippine law.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current.community = el)} id="community" className="scroll-mt-28">
        <Section id="community" title="7. Community Guidelines">
          <h3>Don't</h3>
          <ul>
            <li>Scam, harass, or threaten other users</li>
            <li>Impersonate another person</li>
            <li>Post fake listings or manipulate reviews</li>
            <li>Upload illegal or inappropriate content, including via chat photos</li>
            <li>Circumvent platform rules or use the platform for illegal activity</li>
            <li>Attempt to access another user's account</li>
            <li>Abuse the messaging system</li>
          </ul>
          <h3>Enforcement</h3>
          <p>Depending on severity: warning → content or listing removal → temporary restriction → account suspension → permanent removal.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current.prohibited = el)} id="prohibited" className="scroll-mt-28">
        <Section id="prohibited" title="8. Prohibited Items Policy">
          <ul>
            <li>Illegal goods of any kind</li>
            <li>Stolen property</li>
            <li>Counterfeit goods</li>
            <li>Explosives</li>
            <li>Firearms and prohibited weapons</li>
            <li>Hazardous materials</li>
            <li>Items prohibited by Philippine law</li>
            <li>Any other item Lendeia determines cannot safely be rented on the platform</li>
          </ul>
          <p>This list may be expanded as the marketplace develops.</p>
        </Section>
      </div>

      <div ref={(el) => (refs.current.disputes = el)} id="disputes" className="scroll-mt-28">
        <Section id="disputes" title="9. Dispute Resolution Policy">
          <h3>Step 1 — Report</h3>
          <p>The affected user submits the transaction in question, a description of the problem, and any relevant evidence (photos, messages).</p>
          <h3>Step 2 — Response</h3>
          <p>The other party is given the opportunity to explain their side.</p>
          <h3>Step 3 — Review</h3>
          <p>Lendeia reviews the listing, rental record, messages, and any submitted evidence.</p>
          <h3>Step 4 — Decision</h3>
          <p>Lendeia applies the published rules in this policy set to reach a decision.</p>
          <h3>Step 5 — Resolution</h3>
          <p>Any applicable adjustment is processed according to the outcome.</p>
          <h3>Step 6 — Appeal</h3>
          <p>Users may request a limited review of the decision. This process doesn't remove any rights or remedies you have under applicable Philippine law.</p>
        </Section>
      </div>

      <p className="text-[12px] text-[#8A9089] mt-2 mb-8 rounded-xl bg-[#17231D]/[0.03] px-4 py-3 leading-relaxed">
        This page is a complete policy draft reflecting how Lendeia currently operates and is intended to be
        reviewed by a Philippines-qualified lawyer before being relied on for real transactions —
        particularly the Terms, Rental Terms, cancellation/refund rules, liability provisions, and Privacy
        Policy.
      </p>
        </div>
      </div>
    </div>
  );
}
