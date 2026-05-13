export const VACCINE_OPTIONS = [
  "BCG","Hepatite B","Hepatite A","dTpa","DTP","Penta","VIP",
  "Pneumo 10","Rotavirus","Meningococica","ACWY","Triplice viral",
  "Varicela","Influenza","COVID-19","Febre amarela","HPV",
];

export const PATIENTS_PAGE_SIZE = 8;

export function isChildCategory(category) {
  const c = String(category||"").toLowerCase();
  return c === "puericulture" || c === "child_followup";
}

export function emptyPatientForm() {
  return{
    name:"", motherName:"", motherUnknown:false,
    guardianName:"",
    cpf:"", cns:"",
    birthDate:"", birthCity:"", birthState:"",
    sex:"", raceColor:"",
    maritalStatus:"",
    phone:"", phoneAlt:"",
    zipCode:"", address:"", number:"", complement:"", neighborhood:"", city:"", state:"",
    careCategory:"general", chronicConditions:[], assignedAcsId:"",
    microArea:"", familyCode:"", homeVisitFreq:"",
    housingType:"", waterSupply:"", sewage:"", garbage:"", electricity:"",
    allergies:"", comorbidities:"", medications:"",
    pregnancyStartDate:"", expectedDeliveryDate:"",
    gestationalAgeDumWeeks:"", gestationalAgeDumDays:"",
    gestationalAgeUsgWeeks:"", gestationalAgeUsgDays:"",
    usgDate1:"", usgDate2:"", usgDate3:"",
  };
}
