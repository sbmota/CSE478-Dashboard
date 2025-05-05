// setup chart dimensions and margins 
const margin = { top: 40, right: 30, bottom: 60, left: 70 };
const width = 400 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

// reusable helper to add axis labels
// styled text to chart at given location with optional rotation
function addAxisLabel(svg, text, x, y, anchor = "middle", rotation = 0) {
  svg.append("text")
    .attr("transform", `rotate(${rotation}, ${x}, ${y})`)
    .attr("x", x)
    .attr("y", y)
    .attr("text-anchor", anchor)
    .attr("fill", "#333")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .style("dominant-baseline", "middle")
    .text(text);
}

// load and parse the CSV 
d3.csv("homicide-data.csv", d => {
  // extract year from reported_date field
  const ds = d.reported_date?.toString();
  d.year = ds ? +ds.slice(0, 4) : null;
  return d;
}).then(data => {
  // extract unique values for dropdown filters 
  const years = [...new Set(data.map(d => d.year).filter(Boolean))].sort((a, b) => a - b);
  const cities = [...new Set(data.map(d => d.city).filter(Boolean))].sort();
  const races = [...new Set(data.map(d => d.victim_race).filter(Boolean))].sort();

  // default selections 
  let selectedCity = "Albuquerque";
  let selectedRace = "White";
  const getValidYears = () =>
    Array.from(new Set(
      data.filter(d => d.city === selectedCity && d.victim_race === selectedRace && d.year)
        .map(d => d.year)
    )).sort((a, b) => a - b);
  let selectedYear = getValidYears()[0] || years[0];

  // create SVG containers for each chart 
  const svgLine = d3.select("#barSVG").append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const svgBar = d3.select("#lineSVG").append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const svgScatter = d3.select("#scatterSVG").append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // tooltip for all charts
  const tooltipBL = d3.select("body").append("div")
    .attr("class", "tooltip-bl")
    .style("position", "absolute")
    .style("background", "#333")
    .style("color", "#fff")
    .style("padding", "6px 10px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  // LINE CHART
  // total homicides by year 
  function drawLineChart() {
    d3.select("#lineTitle").text(`Total Homicides by in ${selectedCity}`);
    svgLine.selectAll("*").remove();

    // add d3 annotation for interactivity instructions
    svgLine.append("text")
      .attr("x", width / 2)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .attr("fill", "#777")
      .style("font-size", "13px")
      .text("(Click a point to explore that year's data)");
    
    const filtered = data.filter(d => d.city === selectedCity && d.year);
    if (!filtered.length) {
      svgLine.append("text")
        .attr("x", width / 2 - 60)
        .attr("y", height / 2)
        .attr("fill", "#666")
        .text("No homicide data found.");
      return;
    }

    const yearCounts = d3.rollup(filtered, v => v.length, d => d.year);
    const yearData = Array.from(yearCounts, ([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);

    // create scales
    const x = d3.scaleLinear().domain(d3.extent(yearData, d => d.year)).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(yearData, d => d.count)]).range([height, 0]);

    // add axes
    svgLine.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")))
      .selectAll("text").attr("transform", "rotate(-45)").attr("text-anchor", "end");
    svgLine.append("g").call(d3.axisLeft(y));

    // draw line path
    const line = d3.line().x(d => x(d.year)).y(d => y(d.count));
    svgLine.append("path")
      .datum(yearData)
      .attr("fill", "none")
      .attr("stroke", "#4c9aff")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    // draw data points
    svgLine.selectAll("circle")
      .data(yearData)
      .join("circle")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.count))
      .attr("r", 4)
      .attr("fill", "#4c9aff")
      .on("mouseover", (ev, d) => {
        tooltipBL.transition().duration(100).style("opacity", 0.95);
        tooltipBL.html(`<strong>City:</strong> ${selectedCity}<br><strong>Year:</strong> ${d.year}<br><strong>Homicides:</strong> ${d.count}`)
          .style("left", `${ev.pageX + 10}px`)
          .style("top", `${ev.pageY - 28}px`);
      })
      .on("mouseout", () => tooltipBL.transition().duration(200).style("opacity", 0))
      .on("click", (ev, d) => {
        selectedYear = d.year;
        drawBarChart();
        drawLatLonScatterplot();
      });

    addAxisLabel(svgLine, "Year", width / 2, height + 45);
    addAxisLabel(svgLine, "Total Homicides", -40, height / 2, "middle", -90);
  }

  // BAR CHART 
  // displays homicide counts by victim sex for given city, year, and race
  function drawBarChart() {
    d3.select("#barTitle").text(`Race-Based Homicides by Sex in ${selectedCity} (${selectedYear})`);
    svgBar.selectAll("*").remove(); // clear previous chart contents

    // filter data by city, year, race, and only rows with a victim_sex value
    const filtered = data.filter(d =>
      d.city === selectedCity &&
      d.year === selectedYear &&
      d.victim_sex &&
      d.victim_race === selectedRace
    );

    // show message if no data found
    if (!filtered.length) {
      svgBar.append("text")
        .attr("x", width / 2 - 60)
        .attr("y", height / 2)
        .attr("fill", "#666")
        .text("No data for selected filters.");
      return;
    }

    // group data by victim_sex and count how many records per sex
    const sexCounts = d3.rollup(filtered, v => v.length, d => d.victim_sex);
    const sexData = Array.from(sexCounts, ([sex, count]) => ({ sex, count }))
      .sort((a, b) => b.count - a.count); // sort descending

    // create x and y scales
    const x = d3.scaleBand().domain(sexData.map(d => d.sex)).range([0, width]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(sexData, d => d.count)]).range([height, 0]);

    // draw x and y axes
    svgBar.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svgBar.append("g").call(d3.axisLeft(y));

    // draw bars with tooltips
    svgBar.selectAll("rect")
      .data(sexData)
      .join("rect")
      .attr("x", d => x(d.sex))
      .attr("y", d => y(d.count))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.count))
      .attr("fill", "#b44fc2")
      .on("mouseover", (ev, d) => {
        tooltipBL.transition().duration(100).style("opacity", 0.95);
        tooltipBL.html(`<strong>City:</strong> ${selectedCity}<br><strong>Year:</strong> ${selectedYear}<br><strong>Gender:</strong> ${d.sex}<br><strong>Homicides:</strong> ${d.count}`)
          .style("left", `${ev.pageX + 10}px`)
          .style("top", `${ev.pageY - 28}px`);
      })
      .on("mouseout", () => tooltipBL.transition().duration(200).style("opacity", 0));

    // add axis labels
    addAxisLabel(svgBar, "Victim Sex", width / 2, height + 45);
    addAxisLabel(svgBar, "Homicide Count", -40, height / 2, "middle", -90);
  }

  // SCATTERPLOT
  // shows spatial distribution of homicides using latitude and longitude
  function drawLatLonScatterplot() {
    d3.select("#scatterTitle").text(`Spatial Distribution of Homicides in ${selectedCity} (${selectedYear})`);
    svgScatter.selectAll("*").remove(); // clear previous dots & axes

    // filter dataset for selected city/year & records with lat/lon
    const filtered = data.filter(d =>
      d.city === selectedCity &&
      d.year === selectedYear &&
      d.lat != null &&
      d.lon != null
    );

    // show message if no lat/lon data
    if (!filtered.length) {
      svgScatter.append("text")
        .attr("x", width / 2 - 80)
        .attr("y", height / 2)
        .attr("fill", "#666")
        .text("No coordinate data for these filters.");
      return;
    }

    // create x and y scales
    const x = d3.scaleLinear().domain(d3.extent(filtered, d => +d.lon)).range([0, width]);
    const y = d3.scaleLinear().domain(d3.extent(filtered, d => +d.lat)).range([height, 0]);

    // draw x & y axes with rotated labels
    svgScatter.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5))
      .selectAll("text").attr("transform", "rotate(-45)").attr("text-anchor", "end");

    svgScatter.append("g").call(d3.axisLeft(y).ticks(5));

    // draw each dot on scatterplot
    svgScatter.selectAll("circle")
      .data(filtered)
      .join("circle")
      .attr("cx", d => x(+d.lon))
      .attr("cy", d => y(+d.lat))
      .attr("r", 4)
      .attr("fill", "#4c9aff")
      .attr("opacity", 0.75)
      .on("mouseover", (ev, d) => {
        tooltipBL.transition().duration(100).style("opacity", 0.95);
        tooltipBL.html(`<strong>City:</strong> ${d.city}<br><strong>Year:</strong> ${selectedYear}<br><strong>Longitude:</strong> ${(+d.lon).toFixed(2)}<br><strong>Latitude:</strong> ${(+d.lat).toFixed(2)}`)
          .style("left", `${ev.pageX + 10}px`)
          .style("top", `${ev.pageY - 28}px`);
      })
      .on("mouseout", () => tooltipBL.transition().duration(200).style("opacity", 0));

    // add axis labels
    addAxisLabel(svgScatter, "Longitude", width / 2, height + 45);
    addAxisLabel(svgScatter, "Latitude", -60, height / 2, "middle", -90);
  }

  // DROPDOWN EVENT HANDLERS
  // create city filter dropdown
  d3.select("#citySelect")
    .selectAll("option")
    .data(cities)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  // set default value & add change handler
  d3.select("#citySelect")
    .property("value", selectedCity)
    .on("change", function() {
      selectedCity = this.value;
      selectedYear = getValidYears()[0] || years[0];  // reset to valid year for new city
      drawLineChart();
      drawBarChart();
      drawLatLonScatterplot();
    });

  // create race filter dropdown
  d3.select("#raceSelect")
    .selectAll("option")
    .data(races)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  d3.select("#raceSelect")
    .property("value", selectedRace)
    .on("change", function() {
      selectedRace = this.value;
      drawBarChart();  // only update bar chart
    });

  drawLineChart();         // line chart is drawn first with default city
  drawBarChart();          // bar chart uses  current city, year, and race
  drawLatLonScatterplot(); // scatterplot uses current city and year
});