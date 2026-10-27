<div class="publications" data-publications>
  <div class="publications-heading">
    <h2 id="publications">Publications &amp; Preprints</h2>
    <div class="publication-filters" role="group" aria-label="Publication selection" hidden>
      <button type="button" data-publication-filter="selected" aria-pressed="false" aria-controls="publication-list">Selected</button>
      <button type="button" data-publication-filter="all" aria-pressed="true" aria-controls="publication-list">All</button>
    </div>
  </div>
  <p class="publication-status" role="status" aria-live="polite" aria-atomic="true"></p>
  <ol class="bibliography" id="publication-list">
    {% for link in site.data.publications.main %}
    <li class="publication-entry"{% if link.id %} id="publication-{{ link.id | escape }}"{% endif %}{% if link.selected_order %} data-selected-order="{{ link.selected_order }}"{% endif %}>
      <div class="pub-row">
        <div class="publication-image">
          {% if link.image %}
          <a href="{{ link.arxiv }}" target="_blank" rel="noopener" aria-label="View arXiv abstract for {{ link.title | escape }}">
            <img src="{{ link.image }}" class="teaser" alt="Method diagram for {{ link.title | escape }}" width="1200" height="750" loading="lazy" decoding="async">
          </a>
          {% endif %}
          {% if link.conference_short %}
          <span class="publication-badge">{{ link.conference_short }}</span>
          {% endif %}
        </div>
        <div class="publication-details">
          <div class="title"><a href="{{ link.pdf | default: link.arxiv | default: link.page }}">{{ link.title }}</a></div>
          <div class="author">{{ link.authors }}</div>
          {% if link.conference %}
          <div class="periodical"><em>{{ link.conference }}</em></div>
          {% endif %}
          {% if link.tldr %}
          <p class="publication-tldr"><strong>TL;DR</strong> {{ link.tldr }}</p>
          {% endif %}
          <div class="links">
            {% if link.pdf %}
            <a href="{{ link.pdf }}" class="btn" target="_blank" rel="noopener">PDF</a>
            {% endif %}
            {% if link.code %}
            <a href="{{ link.code }}" class="btn" target="_blank" rel="noopener">Code</a>
            {% endif %}
            {% if link.page %}
            <a href="{{ link.page }}" class="btn" target="_blank" rel="noopener">Page</a>
            {% endif %}
            {% if link.arxiv %}
            <a href="{{ link.arxiv }}" class="btn" target="_blank" rel="noopener">arXiv</a>
            {% endif %}
            {% if link.bibtex %}
            <a href="{{ link.bibtex }}" class="btn" target="_blank" rel="noopener">BibTeX</a>
            {% endif %}
            {% if link.notes %}
            <strong class="publication-note"><i>{{ link.notes }}</i></strong>
            {% endif %}
            {% if link.others %}
            {{ link.others }}
            {% endif %}
          </div>
        </div>
      </div>
    </li>
    {% endfor %}
  </ol>
</div>
